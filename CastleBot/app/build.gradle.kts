plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "pl.bydon.castlebot"
    compileSdk = 35
    defaultConfig {
        applicationId = "pl.bydon.castlebot"
        minSdk = 30
        targetSdk = 32
        versionCode = 7
        versionName = "0.3.3"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation("com.google.mlkit:text-recognition:16.0.1")
    testImplementation("junit:junit:4.13.2")
}
