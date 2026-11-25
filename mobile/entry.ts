/**
 * App entry. The background location task (owner-test, Android only) must be defined at module
 * scope before the root component registers, because Android may start the JS runtime headlessly
 * just to deliver a location batch to it. See src/location/backgroundLocation.ts.
 */
import './src/location/backgroundLocation';
// "Locate now" push wake-up task (owner-test only; defined only when its flag is on).
import './src/location/remoteLocateTask';
import 'expo-router/entry';
