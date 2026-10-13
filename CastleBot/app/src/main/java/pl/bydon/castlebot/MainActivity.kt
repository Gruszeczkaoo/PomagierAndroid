package pl.bydon.castlebot

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("bot", MODE_PRIVATE)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 25, 24, 25)
        }
        val scroll = ScrollView(this)
        scroll.addView(root)
        setContentView(scroll)
        fun label(message: String, size: Float = 16f) {
            root.addView(TextView(this).apply {
                text = message
                textSize = size
                setPadding(4, 10, 4, 10)
            })
        }
        fun button(title: String, action: () -> Unit) {
            root.addView(Button(this).apply {
                text = title
                setOnClickListener { action() }
            })
        }
        label("CastleBot by Don v0.3.1", 24f)
        label("Poprawione wykrywanie rund i celowania. Bot zapamiętuje rundę mimo chwilowego błędu OCR.")
        button("1. Włącz usługę dostępności") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        button("2. Uruchom grę i START") {
            val service = CastleService.instance
            if (service == null) {
                Toast.makeText(this, "Włącz usługę CastleBot w ustawieniach.", Toast.LENGTH_LONG).show()
            } else {
                service.startBot()
                val game = packageManager.getLaunchIntentForPackage(CastleService.GAME)
                if (game != null) startActivity(game)
                else Toast.makeText(this, "Zainstaluj Castle Busters.", Toast.LENGTH_LONG).show()
            }
        }
        button("STOP") { CastleService.instance?.stopBot() }
        root.addView(CheckBox(this).apply {
            text = "Automatycznie wybieraj i próbuj strzelać (v0.3)"
            isChecked = prefs.getBoolean("autoFightV03", true)
            setOnCheckedChangeListener { _, checked ->
                prefs.edit().putBoolean("autoFightV03", checked).apply()
            }
        })
        button("Wyświetl dziennik działania") {
            AlertDialog.Builder(this).setTitle("CastleBot – log")
                .setMessage(prefs.getString("log", "Jeszcze brak zdarzeń."))
                .setPositiveButton("OK", null).show()
        }
        button("Wyślij dziennik") {
            val share = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, prefs.getString("log", "Brak"))
            }
            startActivity(Intent.createChooser(share, "Diagnostyka CastleBot"))
        }
        label("Podczas gry mały panel DON / STOP można przeciągać po ekranie. Dotknij DON, aby rozwinąć START / KAL / TEST. " +
            "KAL zapisuje gest pomiędzy dwoma wskazanymi dotknięciami. " +
            "TEST wykonuje go jeden raz. Nie włączaj auto-strzałów przed testem.")
        label("v0.3 próbuje strzelać na podstawie białego znacznika jednostki. Nie jest to jeszcze inteligentne celowanie. " +
            "Bot nie klika reklam, zakupów ani opcji podwajania nagród. " +
            "Automatyzacja PvP może naruszać regulamin gry.")
    }
}
