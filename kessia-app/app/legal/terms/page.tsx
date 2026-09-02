import type { Metadata } from 'next';
import LegalShell from '../LegalShell';
import { LEGAL_VERSION_LABEL } from '@/lib/legal/versions';

export const metadata: Metadata = { title: 'Conditions générales d’utilisation — KESSIA' };

export default function TermsPage() {
  return (
    <LegalShell title="Conditions générales d’utilisation" updated={LEGAL_VERSION_LABEL}>
      <div className="toc" style={{ marginBottom: 24 }}>
        <a href="#objet">1. Objet et acceptation</a>
        <a href="#compte">2. Compte et éligibilité</a>
        <a href="#kyc">3. Vérification d’identité et plafonds</a>
        <a href="#wallet">4. Wallet et opérations</a>
        <a href="#tontines">5. Tontines et contrat numérique</a>
        <a href="#garantie">6. Fonds de Garantie Solidaire</a>
        <a href="#business">7. Module Business et documents</a>
        <a href="#ai">8. KESSIA AI, Score et simulateurs</a>
        <a href="#tarifs">9. Tarifs</a>
        <a href="#obligations">10. Vos obligations</a>
        <a href="#suspension">11. Suspension et résiliation</a>
        <a href="#resp">12. Responsabilité</a>
        <a href="#donnees">13. Données personnelles</a>
        <a href="#modif">14. Modifications</a>
        <a href="#droit">15. Droit applicable et litiges</a>
      </div>

      <h2 id="objet">1. Objet et acceptation</h2>
      <p>
        Les présentes conditions régissent l’utilisation du service KESSIA (application web,
        back-office, API et fonctionnalités associées). En créant un compte, vous les acceptez
        ainsi que la <a href="/legal/privacy">Politique de confidentialité</a>. L’acceptation est
        horodatée et conservée.
      </p>
      <p>
        KESSIA est une infrastructure coopérative d’épargne collective et d’accompagnement
        entrepreneurial. <strong>KESSIA n’est pas un établissement de paiement</strong> : les
        dépôts et retraits reposent sur des partenaires habilités et sont, en l’absence de
        contrats, <strong>simulés</strong> et signalés comme tels.
      </p>

      <h2 id="compte">2. Compte et éligibilité</h2>
      <ul>
        <li>Vous devez être une personne physique majeure (ou une personne morale dûment
          représentée) et fournir des informations exactes.</li>
        <li>Un compte par personne. Vous êtes responsable de la confidentialité de vos identifiants
          et de l’activité sur votre compte.</li>
        <li>L’activation de la double authentification (2FA) est fortement recommandée.</li>
      </ul>

      <h2 id="kyc">3. Vérification d’identité et plafonds</h2>
      <p>
        Certaines fonctionnalités exigent une vérification d’identité (KYC). Tant que votre
        identité n’est pas vérifiée, ou selon votre niveau de vérification, des <strong>plafonds
        par opération et par mois</strong> s’appliquent aux opérations sortantes. Ces plafonds sont
        affichés dans l’écran « Transparence & tarifs ». KESSIA peut demander des justificatifs
        complémentaires et refuser ou suspendre un compte en cas de doute sérieux, conformément à
        ses obligations de lutte contre le blanchiment et le financement du terrorisme.
      </p>

      <h2 id="wallet">4. Wallet et opérations</h2>
      <ul>
        <li>Le solde affiché reflète le journal comptable interne (ledger), source de vérité. Aucun
          solde n’est modifié en dehors de ce journal.</li>
        <li>Les transferts entre membres KESSIA sont instantanés et sans frais, dans la limite de
          vos plafonds.</li>
        <li>KESSIA peut bloquer temporairement un wallet, une opération ou demander une
          vérification en cas d’activité inhabituelle (voir article 11). <strong>Aucune opération
          n’est bloquée automatiquement sans revue humaine.</strong></li>
        <li>En cas d’échec technique d’un transfert, un mécanisme de contre-passation rétablit le
          solde.</li>
      </ul>

      <h2 id="tontines">5. Tontines et contrat numérique</h2>
      <p>
        Une tontine est un accord entre ses membres. À l’activation d’une tontine, un <strong>contrat
        numérique</strong> fige ses termes (montant, fréquence, calendrier des bénéficiaires,
        règles de retard et de sortie). Rejoindre une tontine vaut acceptation de ce contrat, avec
        acceptation horodatée. KESSIA fournit l’outil (calendrier, cotisations, versements
        automatiques, journal d’événements) mais n’est pas partie au contrat entre membres et ne
        garantit pas les versements.
      </p>

      <h2 id="garantie">6. Fonds de Garantie Solidaire</h2>
      <p>
        Le Fonds de Garantie Solidaire est proposé <strong>en mode démonstration</strong> : aucun
        fonds réel n’est mobilisé, le solde affiché est une projection et un bandeau « non actif »
        est présent en permanence. Son activation est subordonnée à une qualification juridique et,
        le cas échéant, à un partenaire habilité.
      </p>

      <h2 id="business">7. Module Business et documents</h2>
      <ul>
        <li>Le module Business (produits, ventes, dépenses, CRM, devis et factures, trésorerie,
          ADN, plan d’affaires) est un outil de gestion. Les indicateurs sont calculés à partir des
          données que vous saisissez ; leur exactitude relève de votre responsabilité.</li>
        <li>Les devis et factures que vous générez engagent votre entreprise. Il vous appartient
          d’y porter les mentions légales obligatoires applicables à votre activité.</li>
      </ul>

      <h2 id="ai">8. KESSIA AI, Score et simulateurs</h2>
      <ul>
        <li><strong>KESSIA AI</strong> fournit des informations et des suggestions. Il peut se
          tromper ; vérifiez les informations importantes. Il ne peut pas exécuter une opération
          sensible sans votre confirmation explicite.</li>
        <li>Le <strong>KESSIA Score</strong> est un indicateur de confiance à base de règles
          transparentes ; ce n’est pas un score de crédit réglementé et il ne conditionne aucun
          octroi automatique de financement.</li>
        <li>Les <strong>simulateurs</strong> (épargne, tontine, activité) produisent des projections
          à partir de vos hypothèses. Ils n’incluent aucun intérêt et ne constituent pas une
          promesse de rendement.</li>
      </ul>

      <h2 id="tarifs">9. Tarifs</h2>
      <p>
        L’inscription, le wallet, les transferts entre membres, les tontines, le module Business et
        KESSIA AI sont gratuits. Les retraits vers Mobile Money font l’objet de frais affichés avant
        chaque opération. La grille complète figure dans l’écran « Transparence & tarifs ». Toute
        évolution tarifaire est communiquée à l’avance.
      </p>

      <h2 id="obligations">10. Vos obligations</h2>
      <p>Vous vous engagez notamment à ne pas :</p>
      <ul>
        <li>fournir de fausses informations d’identité ou usurper l’identité d’un tiers ;</li>
        <li>utiliser le service à des fins de blanchiment, de fraude ou de financement d’activités
          illicites ;</li>
        <li>tenter de contourner les contrôles de sécurité, les plafonds ou les permissions ;</li>
        <li>porter atteinte au fonctionnement du service ou aux droits des autres membres.</li>
      </ul>

      <h2 id="suspension">11. Suspension et résiliation</h2>
      <p>
        KESSIA peut suspendre ou fermer un compte en cas de manquement grave, de soupçon de fraude
        ou d’obligation légale (gel des avoirs, injonction d’une autorité). Une suspension coupe
        l’accès et révoque les sessions ; elle vous est notifiée. Vous pouvez fermer votre compte à
        tout moment ; certaines données sont conservées pour des durées légales (voir article 13 et
        la Politique de confidentialité).
      </p>

      <h2 id="resp">12. Responsabilité</h2>
      <p>
        Le service est fourni « en l’état ». KESSIA met en œuvre des moyens raisonnables pour
        assurer sa disponibilité et sa sécurité mais ne garantit pas une absence totale
        d’interruption ou d’erreur. KESSIA n’est pas responsable des différends entre membres d’une
        tontine, de l’exactitude des données que vous saisissez, ni des frais appliqués par des
        tiers (opérateurs Mobile Money notamment). Rien dans les présentes ne limite la
        responsabilité qui ne peut légalement l’être.
      </p>

      <h2 id="donnees">13. Données personnelles</h2>
      <p>
        Le traitement de vos données est décrit dans la
        <a href="/legal/privacy"> Politique de confidentialité</a>. Vous disposez de droits d’accès,
        de rectification, de portabilité (export) et d’effacement, exerçables depuis l’écran
        « Confidentialité & données ».
      </p>

      <h2 id="modif">14. Modifications</h2>
      <p>
        Les présentes conditions peuvent évoluer. Toute modification substantielle vous est
        notifiée avant son entrée en vigueur. La poursuite de l’utilisation vaut acceptation de la
        version en vigueur.
      </p>

      <h2 id="droit">15. Droit applicable et litiges</h2>
      <p>
        Les présentes conditions sont régies par le droit togolais. En cas de litige, vous êtes
        invité à contacter le support pour une résolution amiable. À défaut, les tribunaux
        compétents de [ville] sont saisis, sous réserve des règles impératives de protection du
        consommateur.
      </p>
    </LegalShell>
  );
}
