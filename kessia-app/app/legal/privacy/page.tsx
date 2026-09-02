import type { Metadata } from 'next';
import LegalShell from '../LegalShell';
import { LEGAL_VERSION_LABEL } from '@/lib/legal/versions';

export const metadata: Metadata = { title: 'Politique de confidentialité — KESSIA' };

export default function PrivacyPage() {
  return (
    <LegalShell title="Politique de confidentialité" updated={LEGAL_VERSION_LABEL}>
      <div className="toc" style={{ marginBottom: 24 }}>
        <a href="#responsable">1. Responsable du traitement</a>
        <a href="#donnees">2. Données collectées</a>
        <a href="#finalites">3. Finalités et bases légales</a>
        <a href="#partage">4. Partage et sous-traitants</a>
        <a href="#duree">5. Durées de conservation</a>
        <a href="#securite">6. Sécurité</a>
        <a href="#droits">7. Vos droits</a>
        <a href="#transferts">8. Transferts hors zone</a>
        <a href="#cookies">9. Cookies et traceurs</a>
        <a href="#contact">10. Contact et réclamation</a>
      </div>

      <h2 id="responsable">1. Responsable du traitement</h2>
      <p>
        Le responsable du traitement est <strong>[Raison sociale de l’entité exploitante]</strong>,
        siège social [adresse], Togo. Délégué à la protection des données :
        <a href="mailto:privacy@kessia.app"> privacy@kessia.app</a>.
      </p>
      <p><em>Ces informations seront complétées une fois l’entité exploitante constituée.</em></p>

      <h2 id="donnees">2. Données collectées</h2>
      <p>KESSIA applique le principe de minimisation. Sont traitées :</p>
      <ul>
        <li><strong>Identité et compte</strong> : téléphone, nom, prénom, e-mail (facultatif), mot
          de passe (haché), rôle, langue, ville, profession, type de profil déclaré.</li>
        <li><strong>Vérification d’identité (KYC)</strong> : type et images des pièces fournies,
          selfie, statut du dossier, motifs de décision. Les pièces sont stockées dans un espace
          privé et ne sont accessibles qu’à l’équipe conformité via des liens signés de courte
          durée.</li>
        <li><strong>Wallet et opérations</strong> : solde, écritures du journal comptable
          (dépôts, transferts, cotisations, retraits), références d’opérations, paiements
          (simulés).</li>
        <li><strong>Tontines</strong> : appartenance, cotisations, versements, contrat numérique
          accepté, journal d’événements.</li>
        <li><strong>Activité Business</strong> : entreprise, produits, ventes, dépenses, clients et
          fournisseurs que vous saisissez, devis et factures, objectifs, plan d’affaires généré.</li>
        <li><strong>Assistance</strong> : conversations avec KESSIA AI, tickets de support et
          messages.</li>
        <li><strong>Sécurité</strong> : journaux d’audit des actions sensibles, empreinte d’appareil
          (dérivée d’en-têtes techniques, non invasive), adresse IP hachée, alertes anti-fraude,
          sessions actives.</li>
        <li><strong>Notifications</strong> : préférences par catégorie, journal de distribution.</li>
      </ul>
      <p>
        KESSIA ne collecte pas de données de localisation précise, ne pratique pas de
        fingerprinting publicitaire et ne revend jamais vos données.
      </p>

      <h2 id="finalites">3. Finalités et bases légales</h2>
      <table>
        <thead><tr><th>Finalité</th><th>Base légale</th></tr></thead>
        <tbody>
          <tr><td>Fournir le service (compte, wallet, tontines, Business)</td><td>Exécution du contrat</td></tr>
          <tr><td>Vérification d’identité, plafonds, lutte anti-blanchiment</td><td>Obligation légale</td></tr>
          <tr><td>Sécurité, prévention de la fraude, journaux d’audit</td><td>Intérêt légitime · Obligation légale</td></tr>
          <tr><td>Assistance et support</td><td>Exécution du contrat</td></tr>
          <tr><td>Amélioration du service (statistiques agrégées, sans identification)</td><td>Intérêt légitime</td></tr>
          <tr><td>Communications non essentielles (nouveautés)</td><td>Consentement (révocable)</td></tr>
        </tbody>
      </table>
      <p>
        Les tableaux de bord d’administration n’utilisent que des <strong>agrégats</strong> sans
        donnée nominative. KESSIA AI répond à partir de vos données mais ne peut rien inventer
        (solde, paiement, rendement) et applique les mêmes contrôles d’accès que le reste du
        service.
      </p>

      <h2 id="partage">4. Partage et sous-traitants</h2>
      <p>Vos données ne sont partagées qu’avec :</p>
      <ul>
        <li><strong>Supabase</strong> — hébergement de la base de données et stockage des documents
          KYC (région <code>eu-west-1</code>).</li>
        <li><strong>Vercel</strong> — hébergement de l’application et de l’API.</li>
        <li><strong>Upstash</strong> — limitation de débit et cache (données techniques
          uniquement).</li>
        <li>Les <strong>autorités compétentes</strong>, sur demande légale (réquisition,
          injonction, obligations anti-blanchiment).</li>
        <li>À l’avenir et sous contrat : les <strong>partenaires de paiement</strong> (opérateurs
          Mobile Money, banques) pour l’exécution des dépôts et retraits réels, ainsi qu’un
          <strong>prestataire de vérification d’identité</strong>.</li>
      </ul>
      <p>
        Chaque sous-traitant est encadré par un accord de traitement (DPA). La cartographie
        complète est tenue à jour et communiquée sur demande.
      </p>

      <h2 id="duree">5. Durées de conservation</h2>
      <p><em>Durées indicatives, à confirmer avec le conseil juridique selon la réglementation applicable.</em></p>
      <table>
        <thead><tr><th>Donnée</th><th>Durée</th></tr></thead>
        <tbody>
          <tr><td>Compte actif</td><td>Durée de la relation</td></tr>
          <tr><td>Dossiers et pièces KYC</td><td>5 à 10 ans après la fin de la relation (obligation LAB-FT)</td></tr>
          <tr><td>Écritures du journal comptable / opérations</td><td>10 ans (obligation comptable)</td></tr>
          <tr><td>Journaux d’audit</td><td>5 ans</td></tr>
          <tr><td>Journaux techniques applicatifs</td><td>6 à 12 mois</td></tr>
          <tr><td>Codes OTP</td><td>Usage unique, expiration 10 minutes</td></tr>
          <tr><td>Sessions</td><td>Expiration après 30 jours</td></tr>
          <tr><td>Conversations KESSIA AI</td><td>Jusqu’à effacement par l’utilisateur</td></tr>
        </tbody>
      </table>

      <h2 id="securite">6. Sécurité</h2>
      <ul>
        <li>Chiffrement en transit (TLS) et au repos (hébergeur) ; pièces KYC dans un espace privé
          avec accès par liens signés de courte durée.</li>
        <li>Double authentification, contrôle d’accès par rôle, limitation de débit,
          anti-brute-force, validation systématique côté serveur.</li>
        <li>Détection des activités inhabituelles (règles) avec revue humaine ; aucune décision de
          blocage de fonds n’est automatique.</li>
        <li>Journaux d’audit immuables applicativement ; jamais de mot de passe, code OTP ou contenu
          de document journalisé en clair.</li>
        <li>Procédure de sauvegarde et de reprise documentée ; notification des violations de
          données conformément à la réglementation.</li>
      </ul>

      <h2 id="droits">7. Vos droits</h2>
      <p>Vous disposez des droits d’accès, de rectification, d’effacement, de limitation,
        d’opposition et de portabilité. Depuis l’écran <strong>« Confidentialité & données »</strong> :</p>
      <ul>
        <li><strong>Export</strong> : génération immédiate d’une archive de vos données (identité,
          wallet et journal, paiements, tontines, Business, métadonnées KYC sans les pièces,
          notifications, tickets).</li>
        <li><strong>Suppression</strong> : dépôt d’une demande. L’effacement est réalisé selon une
          procédure encadrée, sous réserve des obligations légales de conservation ci-dessus. Le
          nettoyage des pièces KYC dans le stockage est effectué dans le même cadre.</li>
        <li><strong>Consentements</strong> : les communications non essentielles sont
          désactivables à tout moment.</li>
      </ul>

      <h2 id="transferts">8. Transferts hors zone</h2>
      <p>
        Les données sont hébergées dans l’Union européenne (région <code>eu-west-1</code>). Tout
        transfert vers un pays tiers serait encadré par des garanties appropriées (clauses
        contractuelles types ou équivalent).
      </p>

      <h2 id="cookies">9. Cookies et traceurs</h2>
      <p>
        KESSIA n’utilise pas de cookies publicitaires ou de mesure d’audience tierce. Sont utilisés
        uniquement : un cookie d’authentification (jeton d’accès), et un stockage local pour vos
        préférences (thème, langue, brouillons). Aucun de ces éléments n’est partagé avec des tiers.
      </p>

      <h2 id="contact">10. Contact et réclamation</h2>
      <p>
        Pour toute question ou pour exercer vos droits :
        <a href="mailto:privacy@kessia.app"> privacy@kessia.app</a> ou depuis l’onglet Support.
        Vous pouvez également saisir l’autorité de protection des données compétente au Togo.
      </p>
    </LegalShell>
  );
}
