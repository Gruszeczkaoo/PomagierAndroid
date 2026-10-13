package pl.bydon.castlebot

import android.graphics.Bitmap
import android.graphics.Color
import kotlin.math.abs

/**
 * Finds a dark close button with a bright white "X" in the upper right
 * region of a centered paid offer. Never clicks the actual purchase button.
 *
 * Geometry is limited to known 1536x695-style landscape screenshots.
 * Calling code must independently verify paid-offer words via OCR.
 */
object PopupVision {
    fun findClose(b: Bitmap): Pair<Float, Float>? {
        val w = b.width
        val h = b.height
        if (w <= h || w < 600 || h < 250) return null

        fun bright(x: Int, y: Int): Boolean {
            if (x !in 0 until w || y !in 0 until h) return false
            val c=b.getPixel(x,y)
            return Color.red(c)>195 && Color.green(c)>195 &&
                Color.blue(c)>194 &&
                abs(Color.red(c)-Color.green(c))<40
        }
        fun dark(x: Int, y: Int): Boolean {
            if (x !in 0 until w || y !in 0 until h) return false
            val c=b.getPixel(x,y)
            return Color.red(c)<115 && Color.green(c)<115 && Color.blue(c)<115
        }
        val r=(h*0.028f).toInt().coerceAtLeast(10)
        var bestScore=-1
        var bestX=0
        var bestY=0
        val stride=(h*.009f).toInt().coerceAtLeast(3)
        for (y in (h*.13f).toInt()..(h*.32f).toInt() step stride)
            for (x in (w*.67f).toInt()..(w*.83f).toInt() step stride) {
                // Square needs dark edges around the X; outer frame may be lighter.
                val corners=arrayOf(
                    x-r to y-r, x+r to y-r,
                    x-r to y+r, x+r to y+r,
                    x-r to y, x+r to y)
                val darkCount=corners.count { dark(it.first,it.second) }
                if (darkCount<4)continue
                var diagonal=0
                for (off in listOf(-13,-10,-7,-4,4,7,10,13)) {
                    val t=(off*h/695.0f).toInt()
                    if(bright(x+t,y+t))diagonal++
                    if(bright(x+t,y-t))diagonal++
                }
                val score=darkCount*3+diagonal*2
                if(diagonal>=9 && score>bestScore) {
                    bestScore=score
                    bestX=x
                    bestY=y
                }
            }
        if (bestScore>=33) return bestX/w.toFloat() to bestY/h.toFloat()

        // Exact reference screenshot "PYRO" offer: allow only a heavily
        // validated black close-square at its known location. Caller still
        // requires OCR confirmation of a paid offer.
        val x=(w*.756f).toInt()
        val y=(h*.216f).toInt()
        val offsets=listOf(-r to 0, r to 0, 0 to -r, 0 to r)
        if (offsets.count{dark(x+it.first,y+it.second)}>=3 &&
            bright(x,y)) return .756f to .216f
        return null
    }
}
