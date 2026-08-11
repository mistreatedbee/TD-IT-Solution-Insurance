import { Redirect } from 'expo-router';

/** Default unauthenticated entry — architecture.md §1.3 `(auth)/welcome`. */
export default function AuthIndex() {
  return <Redirect href="/(auth)/welcome" />;
}
