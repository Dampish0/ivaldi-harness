import { install } from 'react-native-quick-crypto';

// The shared relay uses standard WebCrypto. Install its native implementation
// before loading the shared modules, which capture crypto.subtle at import time.
install();
