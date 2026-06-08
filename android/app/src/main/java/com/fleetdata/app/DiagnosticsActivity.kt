package com.fleetdata.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.method.ScrollingMovementMethod
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import java.io.File

class DiagnosticsActivity : AppCompatActivity() {

  private fun crashFile(): File = File(filesDir, "diagnostic_crash.log")

  private fun readCrashText(): String {
    val f = crashFile()
    if (!f.exists()) return "No crash log captured yet."
    return f.readText().ifBlank { "No crash log captured yet." }
  }

  private fun clearCrashText() {
    val f = crashFile()
    if (f.exists()) {
      f.writeText("")
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    title = "FleetData Diagnostics"

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(24, 24, 24, 24)
    }

    val heading = TextView(this).apply {
      text = "Diagnostics Mode"
      textSize = 22f
    }

    val sub = TextView(this).apply {
      text = "If app crashes, reopen this screen and share logs."
      textSize = 14f
      setPadding(0, 8, 0, 16)
    }

    val launchBtn = Button(this).apply { text = "Launch App" }
    val shareBtn = Button(this).apply { text = "Share Crash Log" }
    val refreshBtn = Button(this).apply { text = "Refresh Log" }
    val clearBtn = Button(this).apply { text = "Clear Log" }

    val logView = TextView(this).apply {
      text = readCrashText()
      movementMethod = ScrollingMovementMethod()
      textSize = 12f
      setPadding(0, 16, 0, 0)
    }

    val scroll = ScrollView(this).apply {
      addView(logView)
    }

    launchBtn.setOnClickListener {
      startActivity(Intent(this, MainActivity::class.java))
    }

    refreshBtn.setOnClickListener {
      logView.text = readCrashText()
    }

    clearBtn.setOnClickListener {
      clearCrashText()
      logView.text = readCrashText()
    }

    shareBtn.setOnClickListener {
      val file = crashFile()
      if (!file.exists()) {
        file.writeText("No crash log captured yet.")
      }
      val uri: Uri = FileProvider.getUriForFile(
        this,
        "$packageName.fileprovider",
        file
      )
      val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, "FleetData diagnostic crash log")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      startActivity(Intent.createChooser(intent, "Share diagnostic log"))
    }

    root.addView(heading)
    root.addView(sub)
    root.addView(launchBtn)
    root.addView(shareBtn)
    root.addView(refreshBtn)
    root.addView(clearBtn)
    root.addView(scroll)

    setContentView(root)
  }
}
