// Triggering project re-import
plugins {
  alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.otmanager"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.example.otmanager"
        minSdk = 21
        targetSdk = 36
        versionCode = 11
        versionName = "1.1.3"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = false
        aidl = false
        buildConfig = false
        shaders = false
    }
}

dependencies {
    // AndroidX AppCompat + Activity (cần cho AppCompatActivity & OnBackPressedCallback)
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity:1.9.0")
}
