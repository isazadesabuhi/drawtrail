export function TrailIllustration() {
  return (
    <figure className="trail-figure">
      <div className="map-art" aria-hidden="true">
        <svg viewBox="0 0 640 550" fill="none">
          <defs>
            <pattern
              id="map-grid"
              width="50"
              height="50"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-19)"
            >
              <path d="M 50 0 L 0 0 0 50" stroke="#d9ddd2" strokeWidth="1" />
            </pattern>
            <filter id="trail-shadow">
              <feDropShadow
                dx="0"
                dy="5"
                stdDeviation="5"
                floodColor="#b86c30"
                floodOpacity=".16"
              />
            </filter>
          </defs>
          <rect width="640" height="550" fill="#eef0e6" />
          <path
            d="M0 100 Q110 165 150 280 T270 550 L345 550 Q250 340 210 265 T0 38"
            fill="#d6e6e1"
          />
          <path
            d="M0 95 Q112 165 157 280 T279 550"
            stroke="#b4d1cb"
            strokeWidth="2"
          />
          <path
            d="M450 0 640 0 640 130 550 160 480 100Z M0 380 90 360 170 440 150 550 0 550Z"
            fill="#dfe6d1"
          />
          <rect width="640" height="550" fill="url(#map-grid)" />
          <g stroke="#fffdf6" strokeWidth="12">
            <path d="m70 0 180 550M220 0l175 550M390 0l180 550M0 190 640 0M0 360l640-200M0 510l640-195" />
          </g>
          <g stroke="#d6d9cc" strokeWidth="1.3">
            <path d="m70 0 180 550M220 0l175 550M390 0l180 550M0 190 640 0M0 360l640-200M0 510l640-195" />
          </g>
          <g fill="#c7cfba">
            <circle cx="491" cy="87" r="9" />
            <circle cx="514" cy="103" r="7" />
            <circle cx="78" cy="433" r="11" />
            <circle cx="100" cy="449" r="8" />
          </g>
          <path
            d="M327 398C304 373 172 281 184 213C193 153 275 145 314 208C344 137 427 143 451 192C490 271 362 369 327 398Z"
            stroke="#ed7749"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#trail-shadow)"
          />
          <circle
            cx="327"
            cy="398"
            r="12"
            fill="#264f44"
            stroke="#fffdf6"
            strokeWidth="5"
          />
          <g
            fill="#8b9684"
            fontFamily="Arial, sans-serif"
            fontSize="10"
            letterSpacing="2"
          >
            <text x="430" y="325" transform="rotate(-18 430 325)">
              IMAGINE THE WAY
            </text>
            <text x="70" y="95" transform="rotate(-18 70 95)">
              A FRESH PERSPECTIVE
            </text>
          </g>
        </svg>
      </div>
      <span className="art-label">
        <span /> A little love for your neighborhood
      </span>
      <div className="art-sticker" aria-hidden="true">
        GO YOUR
        <br />
        <span>own way.</span>
        <svg viewBox="0 0 60 28">
          <path d="M2 19Q30 35 55 4M40 4h15v15" />
        </svg>
      </div>
      <figcaption>
        <span aria-hidden="true">✎</span> An idea of what’s possible.
        Illustration, not a navigable route.
      </figcaption>
    </figure>
  );
}
