const BrandLogo = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-10 w-auto shrink-0">
    <defs>
      <linearGradient id="pGradient" x1="10" y1="10" x2="32" y2="34" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#00D1FF"/>
        <stop offset="100%" stopColor="#00FFD1"/>
      </linearGradient>
    </defs>
    <path d="M10 10C10 7.79086 11.7909 6 14 6H24C28.4183 6 32 9.58172 32 14C32 18.4183 28.4183 22 24 22H14V34" stroke="url(#pGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 22H20C22.2091 22 24 20.2091 24 18V14" stroke="url(#pGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default BrandLogo;
