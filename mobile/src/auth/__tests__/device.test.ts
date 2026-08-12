/**
 * device.ts caches the resolved deviceId at module scope for the process
 * lifetime, so each case here uses jest.isolateModules (CommonJS require,
 * not dynamic import — this project's Jest config runs under CJS
 * transforms, not --experimental-vm-modules) to get a fresh module
 * instance per test.
 */
describe('auth/device', () => {
  it('persists a newly generated deviceId on first call', async () => {
    let resultPromise: Promise<string>;

    jest.isolateModules(() => {
      const secureStorage = require('../secure-storage');
      jest.spyOn(secureStorage, 'getStoredDeviceId').mockResolvedValueOnce(null);
      jest.spyOn(secureStorage, 'setStoredDeviceId').mockResolvedValue(undefined);

      const { getOrCreateDeviceId } = require('../device');
      resultPromise = getOrCreateDeviceId();
    });

    const id = await resultPromise!;
    expect(id).toBeTruthy();
  });

  it('reuses an existing stored deviceId instead of generating a new one', async () => {
    let resultPromise: Promise<string>;
    let setSpy: jest.SpyInstance;

    jest.isolateModules(() => {
      const secureStorage = require('../secure-storage');
      jest.spyOn(secureStorage, 'getStoredDeviceId').mockResolvedValueOnce('existing-device-id');
      setSpy = jest.spyOn(secureStorage, 'setStoredDeviceId');

      const { getOrCreateDeviceId } = require('../device');
      resultPromise = getOrCreateDeviceId();
    });

    const id = await resultPromise!;
    expect(id).toBe('existing-device-id');
    expect(setSpy!).not.toHaveBeenCalled();
  });
});
