/**
 * @format
 */

import 'react-native-get-random-values';
import {AppRegistry} from 'react-native';
import appConfig from './app.json';
import TrackPlayer from 'react-native-track-player';
import Pages from '@/entry';

AppRegistry.registerComponent(appConfig.expo.name, () => Pages);
TrackPlayer.registerPlaybackService(() => require('./src/service/index'));
