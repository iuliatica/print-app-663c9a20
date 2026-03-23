import Link from "next/link";

export default function TermeniSiConditiiPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6 text-sm text-slate-800">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Termeni și condiții</h1>

      <p>
        Acest site aparține și este operat de <strong>Tica M. Genoveva PFA</strong>, înregistrată în
        România, având CUI <strong>51541140</strong> (denumită în continuare „Furnizorul” sau „Centrul de
        printare”). Prin utilizarea platformei și plasarea de comenzi, sunteți de acord cu prezentele
        Termene și Condiții.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">1. Obiectul serviciului</h2>
        <p>
          Platforma oferă servicii de încărcare fișiere PDF, configurare opțiuni de printare și legare, precum și
          livrare prin curier a documentelor tipărite. Furnizorul nu verifică și nu este responsabil pentru
          conținutul fișierelor încărcate de utilizatori.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">2. Înregistrare și comandă</h2>
        <p>
          Pentru a plasa o comandă, utilizatorul încarcă fișierele, alege opțiunile de printare și livrare, și
          finalizează comanda prin plata online sau selectarea plății ramburs. Utilizatorul este responsabil
          pentru corectitudinea datelor introduse (nume, adresă, telefon, email) și a setărilor de printare alese.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">3. Prețuri și plată</h2>
        <p>
          Prețurile afișate în interfață includ costul de printare și opțional costul de spiralare / legare,
          conform opțiunilor selectate. Costul de livrare este afișat separat înainte de finalizarea comenzii.
          Plata se poate face online, prin procesatorul de plăți integrat (Stripe), sau ramburs la curier, după
          caz.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">4. Termene de execuție și livrare</h2>
        <p>
          Timpul de procesare și livrare este estimat în pagina de comandă, în funcție de volum și perioada
          aglomerată. Furnizorul depune toate eforturile rezonabile pentru respectarea termenelor, dar nu poate
          fi ținut răspunzător pentru întârzieri cauzate de curier sau factori externi (condiții meteo, sărbători
          legale etc.).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">5. Produse personalizate și dreptul de retragere</h2>
        <p>
          Produsele rezultate în urma serviciilor de printare sunt considerate <strong>produse
          personalizate</strong>, realizate după specificațiile utilizatorului și clar personalizate, în sensul
          art. 16 lit. c) din OUG 34/2014.
        </p>
        <p>
          În consecință, <strong>nu se aplică dreptul legal de retragere de 14 zile</strong> pentru aceste
          produse, iar comenzile deja printate nu pot fi returnate și nu pot fi anulate după începerea
          procesului de producție.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">6. Reclamații și neconformități</h2>
        <p>
          Dacă observați neconformități (fișiere greșit tipărite, defecte evidente de tipar sau legare),
          vă rugăm să ne contactați în cel mult 48 de ore de la recepția coletului, furnizând fotografii
          și numărul comenzii. Vom analiza situația și, după caz, putem reprinta documentele sau oferi o
          compensație rezonabilă.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">7. Limitarea răspunderii</h2>
        <p>
          Furnizorul nu poate fi făcut răspunzător pentru pierderi indirecte, profit nerealizat sau orice alte
          prejudicii rezultate din utilizarea serviciului, din erori de conținut ale fișierelor încărcate sau
          din interpretarea greșită a materialelor printate. Răspunderea Furnizorului este, în orice caz,
          limitată la valoarea comenzii în cauză.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">8. Protecția datelor</h2>
        <p>
          Prelucrarea datelor cu caracter personal se face în conformitate cu Politica de Confidențialitate
          disponibilă pe site în secțiunea Legal. Prin plasarea unei comenzi, confirmați că ați citit și
          acceptat această politică.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">9. Legea aplicabilă și soluționarea disputelor</h2>
        <p>
          Prezenții Termeni și Condiții sunt guvernați de legea română. Orice dispută va fi soluționată pe cale
          amiabilă, iar în caz de eșec, de instanțele competente de la sediul Furnizorului. Consumatorii pot
          apela și la mecanismele alternative de soluționare a litigiilor (ANPC, SOL/ODR UE).
        </p>
      </section>

      <div className="pt-4 border-t border-slate-200 mt-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-400"
        >
          Înapoi la pagina principală
        </Link>
      </div>
    </main>
  );
}

