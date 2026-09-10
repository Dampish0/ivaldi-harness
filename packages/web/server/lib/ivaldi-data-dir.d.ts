export function resolveIvaldiDataDirectory(options?: {
  home?: string;
  environment?: { IVALDI_DATA_DIR?: string; OPENCHAMBER_DATA_DIR?: string };
}): string;
