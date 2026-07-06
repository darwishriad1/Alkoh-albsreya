import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {SplashScreen} from '@capacitor/splash-screen';
import {StatusBar, Style} from '@capacitor/status-bar';

export async function initNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await StatusBar.setStyle({style: Style.Dark});
  await StatusBar.setBackgroundColor({color: '#0f172a'});

  App.addListener('backButton', ({canGoBack}) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  await SplashScreen.hide();
}
