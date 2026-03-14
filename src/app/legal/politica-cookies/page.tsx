export default function PoliticaCookiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6 text-sm text-slate-800">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Politica de cookies</h1>

      <p>
        Această politică explică ce sunt cookie-urile și cum le utilizează <strong>[Nume Firmă] SRL</strong>,
        CUI <strong>[CUI]</strong> (denumită în continuare „Operatorul” sau „Furnizorul”) pe platforma de
        printare online.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">1. Ce sunt cookie-urile</h2>
        <p>
          Cookie-urile sunt fișiere text de mici dimensiuni stocate pe dispozitivul dumneavoastră (calculator,
          tabletă, smartphone) atunci când vizitați un site. Ele permit site-ului să vă recunoască, să
          rețină preferințele și să îmbunătățească experiența de navigare.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">2. Tipuri de cookie-uri utilizate</h2>
        <p>Pe acest site putem utiliza următoarele categorii de cookie-uri:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Cookie-uri strict necesare (esențiale):</strong> sunt indispensabile pentru funcționarea
            site-ului (ex.: sesiune, securitate, coș de comenzi). Nu necesită consimțământ.
          </li>
          <li>
            <strong>Cookie-uri de performanță / analiză:</strong> ne ajută să înțelegem cum sunt folosite
            paginile (ex.: număr de vizitatori, pagini accesate). Datele sunt, de regulă, anonimizate.
          </li>
          <li>
            <strong>Cookie-uri de funcționalitate:</strong> rețin preferințele dumneavoastră (ex.: limbă,
            setări afișate) pentru a vă oferi o experiență mai plăcută.
          </li>
          <li>
            <strong>Cookie-uri de marketing (dacă sunt folosite):</strong> pot fi folosite pentru a afișa
            reclame relevante sau pentru măsurarea eficienței campaniilor. Utilizarea lor se bazează pe
            consimțământ, în conformitate cu legislația în vigoare.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">3. Temeiul legal și consimțământul</h2>
        <p>
          Cookie-urile strict necesare sunt utilizate în baza interesului legitim (art. 6 alin. 1 lit. f
          GDPR) și pentru îndeplinirea obligațiilor legale. Pentru cookie-urile care nu sunt strict
          necesare (analiză, funcționalitate, marketing), solicităm consimțământul dumneavoastră în
          conformitate cu Regulamentul (UE) 2016/679 (GDPR) și cu Directiva ePrivacy, așa cum este
          transpusă în legislația română.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">4. Perioada de valabilitate</h2>
        <p>
          Cookie-urile pot fi de sesiune (se șterg la închiderea browserului) sau persistente (rămân pe
          dispozitiv pentru o perioadă definită). Perioadele exacte vor fi indicate în banner-ul sau în
          setările de cookies, dacă sunt puse la dispozitie.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">5. Gestionearea și ștergerea cookie-urilor</h2>
        <p>
          Puteți seta browserul să refuze cookie-uri sau să șteargă cookie-urile existente. Setările se
          fac din meniul de opțiuni al browserului (ex.: Chrome, Firefox, Edge, Safari). Rețineți că
          blocarea cookie-urilor esențiale poate afecta funcționarea site-ului (ex.: coș, autentificare).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">6. Cookie-uri terțe părți</h2>
        <p>
          Site-ul poate include servicii ale unor terți (ex.: procesator de plăți, instrumente de analiză),
          care pot seta propriile cookie-uri. Politica de confidențialitate a acestor furnizori se aplică
          pentru datele colectate prin cookie-urile lor. Vă încurajăm să consultați politicile lor.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">7. Actualizări</h2>
        <p>
          Putem actualiza această politică de cookies pentru a reflecta modificări ale practicilor sau
          ale legislației. Data ultimei actualizări va fi indicată la începutul politicii. Vă rugăm să
          consultați periodic această pagină.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">8. Contact</h2>
        <p>
          Pentru întrebări despre utilizarea cookie-urilor, ne puteți contacta la adresa de email
          indicată în pagina de contact sau în footer-ul site-ului.
        </p>
      </section>
    </main>
  );
}
