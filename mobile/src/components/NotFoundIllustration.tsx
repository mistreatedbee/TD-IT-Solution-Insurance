/**
 * "404" illustration for the page-not-found screen: isometric 4-0-4 blocks with a paper plane.
 * Redrawn as react-native-svg paths from the supplied Figma artwork (node 62788:85777) so that its colours can follow
 * the app's theme: `body` colours the blocks, `accent` the paper plane and dashed trail, `paper` the light faces.
 * Geometry is unchanged from the design (viewBox 266.16 x 239.263).
 */
import React from 'react';
import Svg, { G, Path } from 'react-native-svg';

const VIEW_W = 266.16;
const VIEW_H = 239.263;

export interface NotFoundIllustrationProps {
  /** Rendered width; height follows the artwork's proportions. */
  width?: number;
  body: string;
  accent: string;
  paper: string;
}

export function NotFoundIllustration({
  width = 270,
  body,
  accent,
  paper,
}: NotFoundIllustrationProps) {
  const height = (width * VIEW_H) / VIEW_W;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      fill="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <G>
        <Path
          d="M81.3891 168.54V237.6L141.185 203.07V226.09L161.117 214.58L161.118 122.5L141.185 134.01L141.518 180.241L101.321 203.07L101.32 157.03L81.3891 168.54Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M61.458 157.032V226.092L81.3899 237.602V168.542L61.458 157.032Z"
          fill={body}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M81.3899 145.522L101.321 157.032L81.3899 168.542L61.458 157.032L81.3899 145.522ZM141.186 134.012L121.253 122.502L141.186 110.991L161.118 122.502L141.186 134.012Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M121.253 168.539L141.517 180.241L141.184 134.01L121.251 122.5L121.253 168.539Z"
          fill={body}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M121.253 168.541L141.517 180.243L101.32 203.071L101.32 180.051L121.253 168.541Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M141.185 226.092V203.072L121.253 214.582L141.185 226.092ZM89.8028 36.1933L89.8022 128.274L109.735 139.783V47.7034L89.8028 36.1933Z"
          fill={body}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M109.734 47.7014L169.53 13.1709L149.598 1.661L89.8022 36.1913L109.734 47.7014Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M169.53 13.1695L169.53 105.25L109.733 139.78V47.7L169.53 13.1695Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M149.599 47.7018V93.742L129.668 82.2317V59.2113L149.599 47.7018Z"
          fill={body}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M129.668 105.254L129.668 82.2342L149.6 93.7445L129.668 105.254Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M1.661 18.0668L21.5935 29.5767V75.6165L61.4579 98.6369V52.5965L81.3898 64.1068V156.187L61.4583 144.677L61.4581 121.657L1.661 87.127V18.0668Z"
          fill={body}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M1.661 18.0687L21.5933 6.55837L41.5252 18.0687L21.5935 29.5786L1.661 18.0687ZM21.5935 75.6184L41.5252 64.1089V18.0687L21.5935 29.5786V75.6184Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M61.4566 98.6408L61.4562 75.6204L41.5239 64.1109L21.5922 75.6204L61.4566 98.6408ZM61.4566 52.6004L81.3885 41.0907L101.321 52.6004L81.3885 64.1107L61.4566 52.6004Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M81.3891 156.19L101.321 144.679L101.322 52.5992L81.3891 64.1095V156.19Z"
          fill={paper}
          stroke={body}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M264.499 66.0443L235.621 92.1615V84.12L264.499 66.0443Z"
          fill={accent}
          stroke={accent}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M264.497 66.0443L218.972 76.6622L235.619 84.12L247.267 99.7497L264.497 66.0443ZM235.619 84.12L264.497 66.0443Z"
          fill={paper}
          stroke={accent}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
        <Path
          d="M221.289 98.7757C217.68 101.897 213.754 104.64 209.597 106.975M61.4589 121.66C55.7028 122.268 50.2214 123.373 45.1061 124.921M16.832 141.917C13.0198 146.183 10.1631 150.99 8.45758 156.227C8.13142 157.227 7.38749 159.656 6.91623 162.974M7.34134 176.762C7.81203 178.912 8.50863 181.122 9.50014 183.34C14.0182 193.443 23.5595 201.221 35.9451 206.568M106.795 213.386C118.907 211.46 130.689 208.037 141.186 203.071C142.946 202.238 144.594 201.398 146.126 200.57M155.544 194.76C157.661 193.271 159.141 192.084 159.953 191.42C165.735 186.689 170.518 181.517 174.47 176.157M190.946 137.635C192.698 128.607 192.96 121.056 192.853 116.653C192.815 115.066 192.737 113.471 192.6 111.883M190.885 102.5C190.422 100.978 189.857 99.4888 189.17 98.0458C188.49 96.6174 187.673 95.2377 186.736 93.9476M179.724 87.5777C178.339 86.8017 176.859 86.2018 175.301 85.8205C173.87 85.4703 172.397 85.3216 170.927 85.3614M162.53 87.7522C161.26 88.4926 160.086 89.3952 159.054 90.4468C158.022 91.4985 157.142 92.6897 156.426 93.9738M154.194 102.416C154.182 103.886 154.358 105.357 154.735 106.781C154.892 107.375 155.085 107.964 155.314 108.538M157.152 111.734C157.54 112.213 157.968 112.658 158.44 113.059C159.117 113.636 159.858 114.106 160.646 114.491M165.695 115.94C166.568 116.069 167.447 116.157 168.316 116.223C173.073 116.589 177.861 116.462 182.592 115.87"
          fill={accent}
          stroke={accent}
          strokeWidth={3.322}
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}
