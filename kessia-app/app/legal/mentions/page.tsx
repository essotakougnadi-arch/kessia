import type { Metadata } from 'next';
import LegalShell from '../LegalShell';
import { LEGAL_VERSION_LABEL } from '@/lib/legal/versions';

export const metadata: Metadata = { title: 'Mentions légales — KESSIA' };

export default function MentionsPage() {
  return (
    <LegalShell title="Mentions légales" updated={LEGAL_VERSION_LABEL}>
      <h2>1. Éditeur</h2>
      <p>
        Le service KESSIA est édité par <strong>[Raison sociale de l’entité exploitante]</strong>,
        [forme juridique] au capital de [montant], immatriculée au Registre du Commerce et du Crédit
        Mobilier de [ville] sous le numéro [RCCM], dont le siège social est situé [adresse complète],
        Togo.
      </p>
      <ul>
        <li>Directeur de la publication : [Nom, qualité]</li>
        <li>Contact : <a href="mailto:contact@kessia.app">contact@kessia.app</a> · [téléphone]</li>
        <li>Délégué à la protection des données : <a href="mailto:privacy@kessia.app">privacy@kessia.app</a></li>
      </ul>
      <p>
        <em>Ces informations seront complétées une fois l’entité exploitante constituée.</em>
      </p>

      <h2>2. Hébergement</h2>
      <ul>
        <li>Application et API : Vercel Inc.</li>
        <li>Base de données et stockage des documents : Supabase (région <code>eu-west-1</code>)</li>
        <li>Limitation de débit / cache : Upstash</li>
      </ul>
      <p>
        Le détail des sous-traitants et de leurs garanties figure dans la
        <a href="/legal/privacy"> Politique de confidentialité</a>.
      </p>

      <h2>3. Nature du service</h2>
      <p>
        KESSIA est une infrastructure coopérative destinée à l’épargne collective (tontines), à la
        gestion d’activité et à l’accompagnement des entrepreneurs. <strong>KESSIA n’est pas un
        établissement de paiement ni un émetteur de monnaie électronique.</strong> Les opérations de
        paiement (dépôts, retraits) s’appuient sur des partenaires habilités (opérateurs de Mobile
        Money, banques, établissements agréés). Tant que ces partenariats ne sont pas contractualisés,
        ces opérations sont <strong>simulées</strong> et signalées comme telles dans l’application.
      </p>
      <ul>
        <li>Le <strong>KESSIA Score</strong> est un indicateur de confiance à base de règles
          transparentes. Ce n’est pas un score de crédit réglementé et il ne déclenche aucun octroi
          automatique de financement.</li>
        <li>Le <strong>Fonds de Garantie Solidaire</strong> est en mode démonstration : aucun
          mouvement de fonds réel n’est effectué.</li>
        <li>Les modules <strong>KESSIA Invest</strong> et <strong>KESSIA Insurance</strong> ne sont
          pas ouverts et ne le seront qu’après les validations réglementaires nécessaires. KESSIA
          n’est jamais assureur.</li>
        <li>Les <strong>simulateurs</strong> fournissent des projections à partir d’hypothèses ; ils
          ne promettent aucun rendement.</li>
      </ul>

      <h2>4. Propriété intellectuelle</h2>
      <p>
        La marque « KESSIA », son logo, l’interface et les contenus produits par l’éditeur sont
        protégés. Toute reproduction non autorisée est interdite. Les contenus que vous publiez
        (informations d’activité, messages) restent votre propriété ; vous accordez à KESSIA une
        licence limitée pour les héberger et les traiter aux fins du service.
      </p>

      <h2>5. Signalement</h2>
      <p>
        Pour signaler un contenu illicite, une fraude ou un incident de sécurité :
        <a href="mailto:abuse@kessia.app"> abuse@kessia.app</a> ou depuis l’onglet Support de
        l’application.
      </p>
    </LegalShell>
  );
}
