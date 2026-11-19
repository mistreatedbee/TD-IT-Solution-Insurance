/**
 * App entry. The background location task (owner-test, Android only) must be defined at module
 * scope before the root component registers, because Android may start the JS runtime headlessly
 * just to deliver a location batch to it. See src/location/backgroundLocation.ts.
 */
import './src/location/backgroundLocation';
import 'expo-router/entry';
