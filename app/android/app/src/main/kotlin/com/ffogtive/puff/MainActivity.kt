package com.ffogtive.puff

import android.Manifest
import android.content.pm.PackageManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

// 마이크 모드(선택)용 런타임 권한: 웹뷰 getUserMedia 는 앱이 RECORD_AUDIO 를 받아야 실제로 열린다(코덱스 리뷰)
class MainActivity : FlutterActivity() {
    private var pending: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "puff/permissions").setMethodCallHandler { call, result ->
            if (call.method != "microphone") {
                result.notImplemented()
            } else if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                result.success(true)
            } else if (pending != null) {
                result.success(false) // 이미 묻는 중
            } else {
                pending = result
                requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
            }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_MIC) {
            pending?.success(grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
            pending = null
        }
    }

    companion object {
        private const val REQ_MIC = 4207
    }
}
