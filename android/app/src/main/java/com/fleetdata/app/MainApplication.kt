package com.fleetdata.app
import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

import android.app.Application
import android.content.res.Configuration
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.config.ReactFeatureFlags
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.flipper.ReactNativeFlipper
import com.facebook.soloader.SoLoader

class MainApplication : Application(), ReactApplication {

  private fun appendNativeCrashLog(tag: String, details: String) {
    try {
      val logFile = File(filesDir, "diagnostic_crash.log")
      val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
      logFile.appendText("[$timestamp] [$tag] $details\n\n")
    } catch (_: Throwable) {
    }
  }

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(this, object : DefaultReactNativeHost(this) {
    override fun getPackages(): List<ReactPackage> {
      return PackageList(this).packages
    }

    override fun getJSMainModuleName(): String = "index"

    override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

    override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
    override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
  })

  override val reactHost: ReactHost
    get() = getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()

    val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      val message = throwable.stackTraceToString()
      appendNativeCrashLog("NATIVE_FATAL", "Thread=${thread.name}\n$message")
      previousHandler?.uncaughtException(thread, throwable)
    }

    appendNativeCrashLog("INFO", "MainApplication.onCreate")

    SoLoader.init(this, false)
    if (!BuildConfig.REACT_NATIVE_UNSTABLE_USE_RUNTIME_SCHEDULER_ALWAYS) {
      ReactFeatureFlags.unstable_useRuntimeSchedulerAlways = false
    }
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
    if (BuildConfig.DEBUG) {
      ReactNativeFlipper.initializeFlipper(this, reactNativeHost.reactInstanceManager)
    }
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
