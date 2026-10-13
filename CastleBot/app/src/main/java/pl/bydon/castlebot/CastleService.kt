package pl.bydon.castlebot

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Toast
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.Locale
import java.util.concurrent.Executor

class CastleService : AccessibilityService() {
    companion object {
        const val GAME = "com.epicoro.castleclashers"
        @Volatile var instance: CastleService? = null
            private set
    }
    private enum class Screen { HOME, MATCH, RESULT, REWARD, POPUP, UNKNOWN }
    private val handler = Handler(Looper.getMainLooper())
    private val ocr = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    private val prefs by lazy { getSharedPreferences("bot", Context.MODE_PRIVATE) }
    private val wm by lazy { getSystemService(Context.WINDOW_SERVICE) as WindowManager }
    private var running = false
    private var busy = false
    private var gameForeground = false
    private var overlay: View? = null
    private var panelParams: WindowManager.LayoutParams? = null
    private var panelHeader: android.widget.TextView? = null
    private var panelActions: LinearLayout? = null
    private var panelExpanded = false
    private var calibration: View? = null
    private var firstPoint: Pair<Float, Float>? = null
    private var phase = Screen.UNKNOWN
    private var phaseFrames = 0
    private var phaseClicks = 0
    private var lastClick = 0L
    private var lastShotRound = -1
    private var lastShotAt = 0L
    private var lastMatchSeenAt = 0L
    private var cachedRound = -1
    private var cachedRoundAt = 0L
    private var lastMatchDebugAt = 0L
    private var lastRejectedRoundLogAt = 0L
    private var lastPopupLogAt = 0L
    private var latestPopupClose: Pair<Float, Float>? = null
    private var lastShotReviewRound = -1
    private val tracker = RoundTracker()
    private val tick = object : Runnable {
        override fun run() {
            if (running && !busy && calibration == null && inGame()) screenshot()
            handler.postDelayed(this, 2100)
        }
    }
    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        controls()
        handler.post(tick)
        log("Usługa włączona")
    }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val name = event.packageName?.toString() ?: return
        if (name == GAME) gameForeground = true
        else if (name != packageName) gameForeground = false
    }
    override fun onInterrupt() { stopBot() }
    override fun onDestroy() {
        stopBot()
        handler.removeCallbacks(tick)
        try { overlay?.let { wm.removeView(it) } } catch (_: Exception) {}
        try { calibration?.let { wm.removeView(it) } } catch (_: Exception) {}
        ocr.close()
        instance = null
        super.onDestroy()
    }
    fun startBot() {
        running = true
        phase = Screen.UNKNOWN
        phaseFrames = 0
        phaseClicks = 0
        lastShotRound = -1
        lastCardRound = -1
        lastCardTapAt = 0L
        cachedRound = -1
        cachedRoundAt = 0L
        lastMatchSeenAt = 0L
        lastMatchDebugAt = 0L
        lastShotReviewRound = -1
        tracker.reset()
        togglePanel(false)
        setPanelState()
        log("START")
        toast("CastleBot START")
    }
    fun stopBot() {
        running = false
        setPanelState()
        log("STOP")
        toast("CastleBot STOP")
    }
    private fun toast(s: String) {
        handler.post { Toast.makeText(this, s, Toast.LENGTH_SHORT).show() }
    }
    private fun log(s: String) {
        val all = prefs.getString("log", "").orEmpty()
        val stamp = java.text.SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(java.util.Date())
        prefs.edit().putString("log", (all + stamp + " " + s + "\n").takeLast(10000)).apply()
    }
    private fun inGame(): Boolean {
        val pkg = rootInActiveWindow?.packageName?.toString()
        return pkg == GAME || (pkg.isNullOrEmpty() && gameForeground)
    }
    private fun screenshot() {
        busy = true
        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, Executor { handler.post(it) },
                object : TakeScreenshotCallback {
                    override fun onSuccess(result: ScreenshotResult) {
                        val buffer = result.hardwareBuffer
                        val bmp = try {
                            Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)
                                ?.copy(Bitmap.Config.ARGB_8888, false)
                        } catch (_: Exception) { null }
                        finally { buffer.close() }
                        if (bmp == null) { busy = false; return }
                        scan(bmp)
                    }
                    override fun onFailure(errorCode: Int) {
                        busy = false
                        log("Screenshot error " + errorCode)
                    }
                })
        } catch (e: Exception) {
            busy = false
            log("Screenshot exception " + e.message)
        }
    }
    private fun scan(b: Bitmap) {
        // Recognize the whole screen, then the ROUND HUD at 2x resolution.
        // The full-screen OCR alone regularly confuses "4/24" with "8/24".
        ocr.process(InputImage.fromBitmap(b, 0))
            .addOnSuccessListener { full ->
                val x = (b.width * .425f).toInt().coerceIn(0, b.width - 1)
                val y = (b.height * .028f).toInt().coerceIn(0, b.height - 1)
                val width = (b.width * .16f).toInt().coerceAtMost(b.width - x)
                val height = (b.height * .14f).toInt().coerceAtMost(b.height - y)
                val enlarged = try {
                    val crop = Bitmap.createBitmap(b, x, y, width, height)
                    val scaled = Bitmap.createScaledBitmap(crop, width * 2, height * 2, true)
                    crop.recycle()
                    scaled
                } catch (e: Exception) {
                    log("HUD crop failed: " + e.message)
                    null
                }
                if (enlarged == null) {
                    handleFrame(full, b, "")
                    b.recycle()
                    busy = false
                    return@addOnSuccessListener
                }
                ocr.process(InputImage.fromBitmap(enlarged, 0))
                    .addOnSuccessListener { hud ->
                        handleFrame(full, b, hud.text.uppercase(Locale.ROOT))
                    }
                    .addOnFailureListener {
                        log("HUD OCR failed: " + it.message)
                        handleFrame(full, b, "")
                    }
                    .addOnCompleteListener {
                        enlarged.recycle()
                        b.recycle()
                        busy = false
                    }
            }
            .addOnFailureListener {
                log("OCR error " + it.message)
                b.recycle()
                busy = false
            }
    }

    private fun handleFrame(
        result: com.google.mlkit.vision.text.Text,
        b: Bitmap,
        hud: String
    ) {
        if (!running || !inGame()) return
        val whole = result.text.uppercase(Locale.ROOT).replace('\n', ' ')
            .replace(Regex("\\s+"), " ")
        val lines = result.textBlocks.flatMap { it.lines }.mapNotNull { line ->
            line.boundingBox?.let { Pair(line.text.uppercase(Locale.ROOT), it) }
        }
        fun has(t: String) = whole.contains(t)
        val now = System.currentTimeMillis()

        // Prefer the isolated HUD. Never use text from the card collection
        // as a source of ROUND number.
        val hudRound = roundNumber(hud)
        val rawRound = hudRound ?: roundNumber(whole)
        val previous = tracker.current
        val stableRound = tracker.observe(rawRound, now)
        if (rawRound != null && stableRound != rawRound &&
            now - lastRejectedRoundLogAt > 7000L) {
            log("OCR rundy odrzucone: raw=" + rawRound +
                " stabilna=" + (stableRound ?: "?") +
                " HUD=[" + hud.take(45) + "]")
            lastRejectedRoundLogAt = now
        }
        if (stableRound != null && stableRound != previous) {
            log("RUNDA ZATWIERDZONA " + stableRound +
                " (HUD=" + hud.take(45) + ")")
        }
        val closePoint = PopupVision.findClose(b)
        val namedOffer =
            has("PYRO") || has("LEGENDARY UNIT") ||
            has("GET A NEW") || has("46,99") || has("46.99")
        val genericOffer =
            (has("SPECIAL OFFER") || has("LIMITED OFFER") ||
             has("EXCLUSIVE OFFER") || has("ONE TIME OFFER")) &&
            (has("ZŁ") || has("PLN") || has("BUY"))
        // Never rely on the background HOME OCR when a purchase offer overlays it.
        val visiblePaidOffer = namedOffer || genericOffer
        latestPopupClose = if (visiblePaidOffer) closePoint else null
        if (visiblePaidOffer && closePoint == null &&
            now-lastPopupLogAt>12000L) {
            log("OFERTA wykryta w OCR, ale nie potwierdzono bezpiecznego X; nie dotykam ceny")
            lastPopupLogAt=now
        }
        val direct = when {
            visiblePaidOffer && closePoint != null -> Screen.POPUP
            (has("BATTLE") && has("SUCCESSFUL")) || has("VICTORY") ||
                has("DEFEAT") || (has("BATTLE") && has("FAILED")) -> Screen.RESULT
            has("TAP TO CONTINUE") -> Screen.REWARD
            has("ROUND") || hud.contains("ROUND") ||
                (has("POWER") && has("ANGLE")) -> Screen.MATCH
            (has("ARENA") || has("FORGE") || has("RANKING")) &&
                (has("BATTLE") || isYellowBattle(b)) -> Screen.HOME
            else -> Screen.UNKNOWN
        }
        if (direct == Screen.MATCH) lastMatchSeenAt = now
        val current = when {
            visiblePaidOffer && closePoint == null -> Screen.UNKNOWN
            direct == Screen.UNKNOWN && phase == Screen.MATCH &&
                now - lastMatchSeenAt < 22000L -> Screen.MATCH
            else -> direct
        }

        if (current == Screen.MATCH && now - lastMatchDebugAt >= 10000L) {
            log("MATCH OCR: raw=" + (rawRound ?: "?") +
                " stabilna=" + (stableRound ?: "?") +
                " HUD=[" + hud.take(55) + "] " + whole.take(70))
            lastMatchDebugAt = now
        }

        if (current != phase) {
            phase = current
            phaseFrames = 1
            phaseClicks = 0
            if (phase == Screen.HOME || phase == Screen.RESULT || phase == Screen.REWARD || phase == Screen.POPUP) {
                lastShotRound = -1
                lastCardRound = -1
                tracker.reset()
            }
            log("Ekran " + current + " (OCR=" + whole.take(70) + ")")
        } else phaseFrames++
        if (phaseFrames < 2) return
        if (current == Screen.MATCH) {
            if (prefs.getBoolean("autoFightV03", true)) autoBattleTurn(
                stableRound, whole, b, now)
            return
        }
        if (current == Screen.UNKNOWN || phaseClicks >= 3) return
        val delay = when (current) {
            Screen.HOME -> 6500
            Screen.POPUP -> 4200
            else -> 3200
        }
        if (now - lastClick < delay) return
        fun findClick(word: String, xmin: Float, ymin: Float): Pair<Float, Float>? =
            lines.firstOrNull {
                it.first.contains(word) &&
                    it.second.centerX() > b.width * xmin &&
                    it.second.centerY() > b.height * ymin
            }?.second?.let {
                Pair(it.centerX() / b.width.toFloat(), it.centerY() / b.height.toFloat())
            }
        val point = when (current) {
            Screen.HOME -> findClick("BATTLE", .65f, .69f) ?: Pair(.89f, .89f)
            Screen.RESULT -> findClick("CONTINUE", .56f, .68f) ?: Pair(.75f, .91f)
            Screen.REWARD -> findClick("CONTINUE", .25f, .68f) ?: Pair(.50f, .89f)
            Screen.POPUP -> latestPopupClose
            else -> null
        }
        if (point != null && gesture(point.first, point.second,
                point.first, point.second, b.width, b.height, 90)) {
            phaseClicks++
            lastClick = now
            log("Tap " + current + " #" + phaseClicks +
                if (current == Screen.POPUP) " bezpieczny X (nigdy cena)" else "")
        }
    }
    private fun isYellowBattle(b: Bitmap): Boolean {
        var hits = 0
        for (ix in 0..14) for (iy in 0..5) {
            val x = (b.width*(.81f + ix*.011f)).toInt().coerceIn(0,b.width-1)
            val y = (b.height*(.83f + iy*.025f)).toInt().coerceIn(0,b.height-1)
            val c = b.getPixel(x,y)
            if (Color.red(c)>185 && Color.green(c)>125 && Color.blue(c)<130) hits++
        }
        return hits > 45
    }
    // v0.3: first real automatic shot attempts. Visual marker is a white down arrow.
    // Only one attempt per round: a successful dispatch is not proof of a hit.
    private var lastCardRound = -1
    private var lastCardTapAt = 0L
    private var lastBattleLogAt = 0L

    private fun roundNumber(text: String): Int? {
        val match = Regex("ROUND\\s*([0-9]{1,2})\\s*/\\s*24").find(text)
        if (match != null) return match.groupValues[1].toIntOrNull()
        if (!text.contains("ROUND")) return null
        return Regex("\\b([0-9]{1,2})\\s*/\\s*24\\b")
            .find(text)?.groupValues?.getOrNull(1)?.toIntOrNull()
    }

    private fun autoBattleTurn(
        round: Int?,
        text: String,
        bmp: Bitmap,
        now: Long
    ) {
        if (round == null) {
            if (now-lastBattleLogAt>11000L) {
                log("WALKA: czekam na dwa zgodne odczyty rundy, OCR=" + text.take(60))
                lastBattleLogAt=now
            }
            return
        }
        if (round !in 1..24) return
        if (round == lastShotRound) {
            if (lastShotReviewRound != round && now-lastShotAt>2800L) {
                log("KONTROLA rundy " + round +
                    ": Android wykonał gest, ale trafienie nadal niepotwierdzone; POWER=" +
                    (text.contains("POWER")) + " ANGLE=" + text.contains("ANGLE"))
                lastShotReviewRound = round
            }
            return
        }
        if (now-lastShotAt < 5500L || now-lastCardTapAt<2400L) return

        val marker = BattleVision.detectSelectedUnit(bmp)
        if (marker == null) {
            if (lastCardRound != round && now-lastCardTapAt>4200L) {
                if (gesture(.528f,.889f,.528f,.889f,bmp.width,bmp.height,75,
                        "karta_runda_"+round)) {
                    lastCardRound = round
                    lastCardTapAt = now
                    log("WYBÓR rundy " + round + ": próba wyboru karty")
                }
            } else if (now-lastBattleLogAt>9000L) {
                log("CEL rundy " + round + ": brak pewnej białej strzałki; nie strzelam")
                lastBattleLogAt = now
            }
            return
        }

        // Still a heuristic shot. Marker must pass shape and position checks.
        val offsets = arrayOf(
            floatArrayOf(.22f,-.105f), floatArrayOf(.27f,-.085f),
            floatArrayOf(.19f,-.135f), floatArrayOf(.24f,-.060f)
        )
        val calibrated = prefs.contains("sx") && prefs.contains("sy") &&
            prefs.contains("ex") && prefs.contains("ey")
        val calX = prefs.getFloat("ex", 0.0f) - prefs.getFloat("sx", 0.0f)
        val calY = prefs.getFloat("ey", 0.0f) - prefs.getFloat("sy", 0.0f)
        val validCal = calibrated &&
            kotlin.math.abs(calX) in 0.055f..0.55f &&
            kotlin.math.abs(calY) <= .45f
        val p = if (validCal) floatArrayOf(calX, calY) else
            offsets[(round-1)%offsets.size]
        val sx = marker.x.coerceIn(.13f,.72f)
        val sy = marker.y.coerceIn(.17f,.84f)
        val ex = (sx+p[0]).coerceIn(.04f,.94f)
        val ey = (sy+p[1]).coerceIn(.08f,.86f)
        val coordinates = String.format(Locale.ROOT,
            "%.3f,%.3f->%.3f,%.3f",sx,sy,ex,ey)
        log("CEL rundy " + round + ": strzałka=" +
            String.format(Locale.ROOT,"%.3f,%.3f",marker.x,marker.y) +
            " pewność=" + marker.confidence +
            " profil=" + (if (validCal) "KALIBRACJA" else "HEURYSTYKA") +
            " gest=" + coordinates)

        if (gesture(sx,sy,ex,ey,bmp.width,bmp.height,850,"strzal_runda_"+round)) {
            lastShotRound = round
            lastShotAt = now
            log("Runda " + round + ": AUTO gesture " + coordinates +
                " (przekazany Androidowi, niepotwierdzony w grze)")
        } else {
            log("Runda " + round + ": gest ODRZUCONY")
        }
    }

    private fun gesture(sx:Float,sy:Float,ex:Float,ey:Float,w:Int,h:Int,ms:Long,
                        tag:String = "dotkniecie"): Boolean {
        if (!running || !inGame()) return false
        val path = Path()
        path.moveTo(sx.coerceIn(0f,1f)*w,sy.coerceIn(0f,1f)*h)
        path.lineTo(ex.coerceIn(0f,1f)*w,ey.coerceIn(0f,1f)*h)
        return dispatchGesture(GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path,0,ms)).build(),
            object : GestureResultCallback() {
                override fun onCompleted(gestureDescription: GestureDescription) {
                    if (tag.startsWith("strzal")) log("GEST Android ZAKOŃCZONY: " + tag)
                }
                override fun onCancelled(gestureDescription: GestureDescription) {
                    log("GEST Android ANULOWANY: " + tag)
                    // A cancelled gesture must not count as a completed round.
                    if (tag.startsWith("strzal")) lastShotRound = -1
                }
            }, handler)
    }
    // All dimensions are dp, not raw pixels. Normal Android Buttons have large
    // minimum widths and were clipped in landscape when given 110 px.
    private fun dp(v: Float): Int = (v * resources.displayMetrics.density + .5f).toInt()

    private fun setPanelState() {
        panelHeader?.text = if (running) "DON ●" else "DON ○"
    }

    private fun controls() {
        if (overlay != null) return

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(4f), dp(4f), dp(4f), dp(4f))
            background = android.graphics.drawable.GradientDrawable().apply {
                setColor(0xDA142538.toInt())
                cornerRadius = dp(11f).toFloat()
            }
        }

        fun chip(label: String, widthDp: Float, backgroundColor: Int, action: () -> Unit): android.widget.TextView {
            val item = android.widget.TextView(this).apply {
                text = label
                textSize = 12f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                contentDescription = label
                isClickable = true
                isFocusable = true
                background = android.graphics.drawable.GradientDrawable().apply {
                    setColor(backgroundColor)
                    cornerRadius = dp(8f).toFloat()
                }
                setOnClickListener { action() }
            }
            item.layoutParams = LinearLayout.LayoutParams(dp(widthDp), dp(38f)).apply {
                setMargins(dp(2f), 0, dp(2f), 0)
            }
            return item
        }

        val headerRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        root.addView(headerRow)
        val header = chip("DON ○", 84f, 0xFF225B80.toInt()) { togglePanel() }
        panelHeader = header
        headerRow.addView(header)

        // Emergency STOP is visible even when the rest of the panel is folded.
        headerRow.addView(chip("STOP", 64f, 0xFFC33B3B.toInt()) { stopBot() })

        val actions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            visibility = View.GONE
            setPadding(0, dp(4f), 0, 0)
        }
        actions.addView(chip("START", 64f, 0xFF24764B.toInt()) { startBot() })
        actions.addView(chip("KAL", 64f, 0xFF365F9D.toInt()) {
            togglePanel(false)
            calibrate()
        })
        actions.addView(chip("TEST", 64f, 0xFF365F9D.toInt()) {
            togglePanel(false)
            testShot()
        })
        root.addView(actions)
        panelActions = actions

        // Drag only on DON. A short tap on DON expands/collapses controls.
        header.setOnTouchListener(object : View.OnTouchListener {
            var downX = 0f
            var downY = 0f
            var originX = 0
            var originY = 0
            var moved = false

            override fun onTouch(v: View, event: MotionEvent): Boolean {
                val p = panelParams ?: return false
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        downX = event.rawX
                        downY = event.rawY
                        originX = p.x
                        originY = p.y
                        moved = false
                        return true
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = event.rawX - downX
                        val dy = event.rawY - downY
                        if (kotlin.math.abs(dx) > dp(7f) || kotlin.math.abs(dy) > dp(7f)) {
                            moved = true
                        }
                        if (moved) {
                            val bounds = wm.currentWindowMetrics.bounds
                            p.x = (originX + dx.toInt()).coerceIn(
                                0, (bounds.width() - root.width).coerceAtLeast(0))
                            p.y = (originY + dy.toInt()).coerceIn(
                                0, (bounds.height() - root.height).coerceAtLeast(0))
                            try { wm.updateViewLayout(root, p) }
                            catch (e: Exception) { log("Drag: " + e.message) }
                        }
                        return true
                    }
                    MotionEvent.ACTION_UP -> {
                        if (!moved) v.performClick()
                        else {
                            prefs.edit().putInt("panelX",p.x).putInt("panelY",p.y).apply()
                        }
                        return true
                    }
                    MotionEvent.ACTION_CANCEL -> return true
                }
                return false
            }
        })

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = prefs.getInt("panelX", dp(12f))
            y = prefs.getInt("panelY", dp(96f))
        }

        try {
            wm.addView(root, params)
            overlay = root
            panelParams = params
            setPanelState()
        } catch (e: Exception) { log("Overlay: " + e.message) }
    }

    private fun togglePanel(force: Boolean? = null) {
        panelExpanded = force ?: !panelExpanded
        panelActions?.visibility = if (panelExpanded) View.VISIBLE else View.GONE
        overlay?.let { view ->
            panelParams?.let { p ->
                try { wm.updateViewLayout(view, p) }
                catch (e: Exception) { log("Panel: " + e.message) }
            }
        }
    }

    private fun calibrate() {
        if (calibration != null) return
        firstPoint = null
        val v = View(this).apply { setBackgroundColor(0x44000000) }
        v.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_DOWN) {
                val w=resources.displayMetrics.widthPixels.toFloat()
                val h=resources.displayMetrics.heightPixels.toFloat()
                val p=Pair((event.rawX/w).coerceIn(0f,1f),(event.rawY/h).coerceIn(0f,1f))
                val a=firstPoint
                if (a==null) { firstPoint=p; toast("Teraz dotknij końca gestu") }
                else {
                    prefs.edit().putFloat("sx",a.first).putFloat("sy",a.second)
                        .putFloat("ex",p.first).putFloat("ey",p.second).apply()
                    try { wm.removeView(v) } catch (_: Exception) {}
                    calibration=null
                    toast("Gest zapisany")
                    log("Zapisano kalibrację")
                }
            }
            true
        }
        val p = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )
        try { wm.addView(v,p); calibration=v; toast("Dotknij startu gestu") }
        catch (e: Exception) { log("Kalibracja " + e.message) }
    }
    private fun testShot() {
        if (!prefs.contains("sx") || !prefs.contains("ex")) { toast("Najpierw KAL"); return }
        val w=resources.displayMetrics.widthPixels
        val h=resources.displayMetrics.heightPixels
        val success=gesture(prefs.getFloat("sx",.3f),prefs.getFloat("sy",.5f),
            prefs.getFloat("ex",.5f),prefs.getFloat("ey",.5f),w,h,380)
        toast(if (success) "Gest TEST wykonany" else "Nie udało się wykonać")
    }
}
