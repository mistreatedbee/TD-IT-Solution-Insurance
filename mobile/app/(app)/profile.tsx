import { Redirect } from 'expo-router';

/** Legacy route — profile tab moved to account hub. */
export default function ProfileRedirect() {
  return <Redirect href="/(app)/account" />;
}
