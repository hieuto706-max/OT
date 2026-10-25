// Triggering project re-import
plugins {
  alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.otmanager"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.hieuto.otmanager"
        minSdk = 29
        targetSdk = 36
        versionCode = 30
        versionName = "1.5.4"
    }

    signingConfigs {
        create("release") {
            storeFile = file("release.jks")
            storePassword = "otmanager123"
            keyAlias = "otmanager"
            keyPassword = "otmanager123"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
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
    
    // Firebase Cloud Messaging Native SDK
    implementation("com.google.firebase:firebase-messaging:23.4.1")
}
