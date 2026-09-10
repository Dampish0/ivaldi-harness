import React from 'react';
import { useI18n } from '@/lib/i18n';

interface OpenChamberLogoProps {
  className?: string;
  width?: number;
  height?: number;
  isAnimated?: boolean;
}

/**
 * The exported name is kept for source compatibility with upstream. The mark
 * itself is Ivaldi's original forge-inspired monogram: a compact I held inside
 * a softly chamfered field.
 */
export const OpenChamberLogo: React.FC<OpenChamberLogoProps> = ({
  className = '',
  width = 70,
  height = 70,
  isAnimated = false,
}) => {
  const { t } = useI18n();
  const gapMaskId = React.useId();

  return (
    <svg
      width={width}
      height={height}
      viewBox="108 105 302 302"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={t('openChamberLogo.aria.logo')}
    >
      {isAnimated ? (
        <style>{`@keyframes ivaldi-mark-breathe{0%,100%{opacity:.78}50%{opacity:1}}.ivaldi-mark-breathe{animation:ivaldi-mark-breathe 1.8s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.ivaldi-mark-breathe{animation:none}}`}</style>
      ) : null}
      <defs>
        <mask id={gapMaskId} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="#fff" />
          <polygon points="252.50,256.00 422.50,133.00 459.50,220.00 454.50,314.00" fill="#000" />
        </mask>
      </defs>
      <g className={isAnimated ? 'ivaldi-mark-breathe' : undefined} fill="currentColor">
        <circle
          cx="252.5"
          cy="256"
          r="118"
          fill="none"
          stroke="currentColor"
          strokeWidth="48"
          mask={`url(#${gapMaskId})`}
        />
        <polygon points="374.50,207.00 401.50,234.00 374.50,261.00 347.50,234.00" />
      </g>
    </svg>
  );
};
