package `fun`.upup.musicfree

import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.ByteArrayOutputStream

class PlaylistShareModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = "PlaylistShare"

  @ReactMethod
  fun getInitialSharedPlaylist(promise: Promise) {
    try {
      promise.resolve(readSharedContent(context.currentActivity?.intent))
    } catch (error: Exception) {
      promise.reject("SHARED_FILE_READ_FAILED", error)
    }
  }

  @ReactMethod
  fun clearInitialSharedPlaylist(promise: Promise) {
    context.currentActivity?.intent?.let { intent ->
      intent.action = null
      intent.data = null
      intent.type = null
      intent.clipData = null
      intent.categories?.toList()?.forEach(intent::removeCategory)
      intent.removeExtra(Intent.EXTRA_STREAM)
      intent.removeExtra(Intent.EXTRA_TEXT)
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) { }

  @ReactMethod
  fun removeListeners(count: Int) { }

  fun dispatchSharedIntent(intent: Intent) {
    try {
      val raw = readSharedContent(intent) ?: return
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("MusicFreeSharedPlaylist", raw)
    } catch (error: Exception) {
      context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("MusicFreeSharedPlaylistError", error.message ?: "无法读取分享文件")
    }
  }

  private fun readSharedContent(intent: Intent?): String? {
    if (intent == null) return null
    val uri: Uri? = when (intent.action) {
      Intent.ACTION_SEND -> {
        intent.getParcelableExtra(Intent.EXTRA_STREAM)
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        val streams = intent.getParcelableArrayListExtra<android.os.Parcelable>(Intent.EXTRA_STREAM)
          ?.filterIsInstance<Uri>()
          .orEmpty()
        if (streams.size > 1) {
          throw IllegalArgumentException("请一次分享一个歌单文件；多个歌单请先导出为同一个分享文件")
        }
        streams.firstOrNull()
      }
      Intent.ACTION_VIEW -> intent.data
      else -> null
    }
    if (uri == null) return null

    val input = context.contentResolver.openInputStream(uri) ?: return null
    input.use { stream ->
      val output = ByteArrayOutputStream()
      val buffer = ByteArray(64 * 1024)
      var total = 0
      while (true) {
        val count = stream.read(buffer)
        if (count < 0) break
        total += count
        if (total > 64 * 1024 * 1024) throw IllegalArgumentException("共享歌单文件超过 64 MB")
        output.write(buffer, 0, count)
      }
      return output.toString(Charsets.UTF_8.name())
    }
  }
}
