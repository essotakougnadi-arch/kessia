// ============================================================
// KESSIA — Seed de démonstration
// Personas togolais, entreprises, tontines des 4 types, Fonds de
// Garantie Solidaire, notifications, tickets. NE PAS exécuter en prod.
//
//   npm run db:seed
// ============================================================

import { PrismaClient, Prisma, type TontineFrequency, type TontineType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generateInviteCode, generateIdempotencyKey } from '../lib/utils/crypto';
import { buildAgreementTerms } from '../lib/tontine/agreement';
import { addFrequencyN } from '../lib/tontine/schedule';
import { generateBusinessPlanDraft } from '../lib/business/plan';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Kessia2026!';
const D = 86_400_000;

const daysAgo = (n: number) => new Date(Date.now() - n * D);
const daysFromNow = (n: number) => new Date(Date.now() + n * D);
const dec = (n: number) => new Prisma.Decimal(n);

// ── Ledger ──────────────────────────────────────────────────

type EntrySpec = {
  type: Prisma.LedgerEntryCreateManyInput['type'];
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  description: string;
  when: Date;
};

async function seedLedger(walletId: string, specs: EntrySpec[]): Promise<number> {
  let balance = 0;
  for (const s of specs) {
    const before = balance;
    balance = s.direction === 'CREDIT' ? before + s.amount : before - s.amount;
    await prisma.ledgerEntry.create({
      data: {
        walletId, type: s.type, direction: s.direction,
        amount: dec(s.amount), balanceBefore: dec(before), balanceAfter: dec(balance),
        status: 'COMPLETED', description: s.description,
        idempotencyKey: generateIdempotencyKey('SEED'),
        createdAt: s.when, processedAt: s.when,
      },
    });
  }
  await prisma.wallet.update({ where: { id: walletId }, data: { balance: dec(balance) } });
  return balance;
}

// ── Utilisateurs ────────────────────────────────────────────

type Kyc = 'NOT_STARTED' | 'IN_PROGRESS' | 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'VERIFIED';

async function createUser(o: {
  phone: string; firstName: string; lastName: string;
  role?: Prisma.UserCreateInput['role'];
  userType?: Prisma.UserProfileCreateInput['userType'];
  kyc?: Kyc; city?: string; profession?: string; score?: number;
  twoFactor?: boolean; createdDaysAgo?: number;
}) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const verified = o.kyc === 'VERIFIED';
  return prisma.user.create({
    data: {
      phone: o.phone, firstName: o.firstName, lastName: o.lastName, passwordHash,
      role: o.role ?? 'USER', isActive: true, isPhoneVerified: true,
      twoFactorEnabled: o.twoFactor ?? false,
      termsAcceptedVersion: '2026-08-29',
      termsAcceptedAt: daysAgo(o.createdDaysAgo ?? 120),
      kycStatus: o.kyc ?? 'NOT_STARTED',
      kycLevel: verified ? 2 : 0,
      lastLoginAt: daysAgo(Math.random() * 3),
      createdAt: daysAgo(o.createdDaysAgo ?? 120),
      profile: {
        create: {
          city: o.city ?? 'Lomé', country: 'TG', language: 'fr',
          profession: o.profession, kessiaScore: o.score ?? 0,
          userType: o.userType ?? 'INDIVIDUAL',
          userTypeSetAt: o.userType ? daysAgo(o.createdDaysAgo ?? 120) : null,
        },
      },
      wallet: { create: {} },
    },
    include: { wallet: true },
  });
}

// ── Tontine active clé-en-main (avec contrat + événements) ───

type TMember = { user: { id: string; firstName: string; lastName: string }; joinDaysAgo: number };

async function seedTontine(o: {
  name: string; description: string; type: TontineType;
  amount: number; frequency: TontineFrequency; maxMembers: number;
  rules?: string; isPublic?: boolean; membershipConditions?: string; createdBy: { id: string };
  members: TMember[];
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED';
  startDaysAgo: number;
  /** Achat : 'SOLO' pour un plan d'achat individuel (1 membre). */
  purchaseMode?: 'GROUP' | 'SOLO';
  purchaseItem?: string;
  targetAmount?: number;
  /** Achat SOLO : nombre de versements (sinon = nombre de membres). */
  plannedRounds?: number;
  /** pour ACTIVE/COMPLETED : tour courant (COMPLETED → totalRounds) */
  currentRound?: number;
  /** membres n'ayant pas encore payé le tour courant (positions, 1-indexé) */
  unpaidPositions?: number[];
  /** positions dont la cotisation du tour courant est en retard */
  latePositions?: number[];
}) {
  const isSolo = o.type === 'PURCHASE' && o.purchaseMode === 'SOLO';
  const meta = { rotating: ['CLASSIC_ROTATING', 'PURCHASE'], project: ['PROJECT'], growth: ['GROWTH'] };
  const distribution: 'rotating' | 'project' | 'growth' | 'solo' = isSolo
    ? 'solo'
    : meta.rotating.includes(o.type)
      ? 'rotating'
      : o.type === 'PROJECT'
        ? 'project'
        : 'growth';
  const totalRounds =
    distribution === 'project' ? 1 : isSolo ? Math.max(1, o.plannedRounds ?? 1) : o.members.length;
  const start = daysAgo(o.startDaysAgo);
  const inviteCode = generateInviteCode();

  const isActive = o.status !== 'PENDING';
  const currentRound = o.status === 'COMPLETED' ? totalRounds : (o.currentRound ?? 1);
  const nextDue = isActive ? addFrequencyN(start, o.frequency, currentRound - 1) : null;

  const positioned = o.members.map((m, i) => ({
    userId: m.user.id, orderPosition: i + 1, joinedAt: daysAgo(m.joinDaysAgo), user: m.user,
  }));

  const agreement = isActive
    ? buildAgreementTerms(
        { id: 'pending', name: o.name, description: o.description, type: o.type,
          purchaseMode: o.purchaseMode ?? 'GROUP', purchaseItem: o.purchaseItem ?? null,
          targetAmount: o.targetAmount ?? null, amount: dec(o.amount),
          currency: 'XOF', frequency: o.frequency, startDate: start, totalRounds, rules: o.rules ?? null },
        positioned, start
      )
    : null;

  const tontine = await prisma.tontine.create({
    data: {
      name: o.name, description: o.description, type: o.type,
      purchaseMode: o.purchaseMode ?? 'GROUP',
      purchaseItem: o.purchaseItem,
      targetAmount: o.targetAmount != null ? dec(o.targetAmount) : null,
      amount: dec(o.amount), currency: 'XOF', frequency: o.frequency,
      startDate: start, maxMembers: o.maxMembers, rules: o.rules,
      isPublic: o.isPublic ?? false, membershipConditions: o.membershipConditions ?? null, inviteCode,
      status: o.status,
      createdById: o.createdBy.id,
      currentRound: isActive ? currentRound : 0,
      totalRounds,
      nextContributionDate: nextDue,
      completedAt: o.status === 'COMPLETED' ? addFrequencyN(start, o.frequency, totalRounds) : null,
      agreementJson: agreement ? (agreement as unknown as Prisma.InputJsonValue) : undefined,
      agreementGeneratedAt: isActive ? start : null,
      members: {
        create: positioned.map((m) => ({
          userId: m.userId, status: 'ACTIVE', orderPosition: m.orderPosition,
          joinedAt: m.joinedAt,
          agreementAcceptedAt: isActive ? m.joinedAt : null,
        })),
      },
    },
    include: { members: true },
  });

  const memberByPos = new Map(tontine.members.map((m) => [m.orderPosition, m]));

  // Événements
  const ev: Prisma.TontineEventCreateManyInput[] = [
    { tontineId: tontine.id, type: 'CREATED', actorId: o.createdBy.id, createdAt: daysAgo(o.startDaysAgo + 3) },
  ];
  for (const m of o.members.slice(1)) {
    ev.push({ tontineId: tontine.id, type: 'MEMBER_JOINED', actorId: m.user.id, createdAt: daysAgo(m.joinDaysAgo) });
  }
  if (isActive) ev.push({ tontineId: tontine.id, type: 'ACTIVATED', actorId: o.createdBy.id, createdAt: start });

  if (isActive) {
    // Compte séquestre (§6.5) + son ledger — reflète les cotisations
    // encaissées (CREDIT) et les versements émis (DEBIT) pour que
    // solde(séquestre) == Σ cotisations PAID − Σ totalReceived.
    const escrow = await prisma.wallet.create({
      data: { tontineId: tontine.id, kind: 'TONTINE_ESCROW', currency: 'XOF', balance: 0 },
    });
    const escrowSpecs: EntrySpec[] = [];
    const contributedByMember = new Map<string, number>();

    // Cotisations + versements des tours révolus + du tour courant
    for (let round = 1; round <= currentRound; round++) {
      const due = addFrequencyN(start, o.frequency, round - 1);
      const isCurrent = round === currentRound && o.status === 'ACTIVE';
      for (const m of tontine.members) {
        const unpaid = isCurrent && (o.unpaidPositions ?? []).includes(m.orderPosition!);
        const late = isCurrent && (o.latePositions ?? []).includes(m.orderPosition!);
        const status = unpaid || late ? (late ? 'LATE' : 'PENDING') : 'PAID';
        const paidAt = status === 'PAID' ? new Date(due.getTime() - Math.random() * 2 * D) : null;
        await prisma.tontineContribution.create({
          data: {
            tontineId: tontine.id, memberId: m.id, round, amount: dec(o.amount),
            status, dueDate: due, paidAt, createdAt: due,
          },
        });
        if (status === 'PAID') {
          ev.push({ tontineId: tontine.id, type: 'CONTRIBUTION_PAID', actorId: m.userId, round, amount: dec(o.amount), createdAt: due });
          escrowSpecs.push({
            type: 'TONTINE_CONTRIBUTION', direction: 'CREDIT', amount: o.amount,
            description: `Cotisation reçue — « ${o.name} » Tour ${round}`,
            when: paidAt ?? due,
          });
          contributedByMember.set(m.id, (contributedByMember.get(m.id) ?? 0) + o.amount);
        }
      }
      // Versement du tour (tours révolus uniquement)
      const settled = round < currentRound || (round === currentRound && o.status === 'COMPLETED');
      if (settled && distribution !== 'growth' && distribution !== 'solo') {
        const pot = o.amount * tontine.members.length;
        const recipient = distribution === 'project' ? memberByPos.get(1)! : memberByPos.get(round)!;
        await prisma.tontineSchedule.create({
          data: { tontineId: tontine.id, round, dueDate: due, recipientId: recipient.userId, isPaid: true, paidAt: due, createdAt: start },
        });
        await prisma.tontineMember.update({
          where: { id: recipient.id },
          data: { totalReceived: { increment: pot } },
        });
        escrowSpecs.push({
          type: 'TONTINE_PAYOUT', direction: 'DEBIT', amount: pot,
          description: distribution === 'project'
            ? `Cagnotte du projet « ${o.name} »`
            : `Versement « ${o.name} » — Tour ${round}`,
          when: new Date(due.getTime() + 3600_000),
        });
        ev.push({ tontineId: tontine.id, type: 'PAYOUT', actorId: recipient.userId, round, amount: dec(pot), createdAt: due });
        if (round < currentRound) ev.push({ tontineId: tontine.id, type: 'ROUND_ADVANCED', round: round + 1, createdAt: due });
      }
      // total contribué
      for (const m of tontine.members) {
        const paidThisRound = !((isCurrent) && ((o.unpaidPositions ?? []).includes(m.orderPosition!) || (o.latePositions ?? []).includes(m.orderPosition!)));
        if (paidThisRound) {
          await prisma.tontineMember.update({ where: { id: m.id }, data: { totalContributed: { increment: o.amount } } });
        }
      }
    }

    // Croissance / Achat solo : restitution intégrale à la clôture
    if ((distribution === 'growth' || distribution === 'solo') && o.status === 'COMPLETED') {
      const end = addFrequencyN(start, o.frequency, totalRounds);
      for (const m of tontine.members) {
        const back = contributedByMember.get(m.id) ?? 0;
        if (back <= 0) continue;
        await prisma.tontineMember.update({ where: { id: m.id }, data: { totalReceived: { increment: back } } });
        escrowSpecs.push({
          type: 'TONTINE_PAYOUT', direction: 'DEBIT', amount: back,
          description: `Épargne restituée — « ${o.name} »`,
          when: new Date(end.getTime() + 3600_000),
        });
        ev.push({ tontineId: tontine.id, type: 'PAYOUT', actorId: m.userId, round: totalRounds, amount: dec(back), createdAt: end });
      }
    }

    escrowSpecs.sort((a, b) => a.when.getTime() - b.when.getTime());
    if (escrowSpecs.length) await seedLedger(escrow.id, escrowSpecs);
    // schedules futurs (rotating)
    if (distribution === 'rotating') {
      for (let round = currentRound + (o.status === 'COMPLETED' ? 1 : 1); round <= totalRounds; round++) {
        const due = addFrequencyN(start, o.frequency, round - 1);
        const rec = memberByPos.get(round);
        await prisma.tontineSchedule.create({
          data: { tontineId: tontine.id, round, dueDate: due, recipientId: rec?.userId ?? null, isPaid: false, createdAt: start },
        });
      }
    }
    if (o.status === 'COMPLETED') ev.push({ tontineId: tontine.id, type: 'COMPLETED', round: totalRounds, createdAt: addFrequencyN(start, o.frequency, totalRounds) });
    if ((o.latePositions ?? []).length) ev.push({ tontineId: tontine.id, type: 'CONTRIBUTION_LATE', round: currentRound, createdAt: daysAgo(1) });
  }

  await prisma.tontineEvent.createMany({ data: ev });
  return tontine;
}

// ── Nettoyage ───────────────────────────────────────────────

async function wipe() {
  const steps = [
    // Ledger d'abord (FK Restrict depuis LedgerEntry), puis les wallets
    // — y compris les comptes séquestre (Wallet.tontineId, §6.5).
    () => prisma.ledgerEntry.deleteMany(),
    () => prisma.wallet.deleteMany(),
    () => prisma.guaranteeEvent.deleteMany(),
    () => prisma.guaranteeClaim.deleteMany(),
    () => prisma.aiMessage.deleteMany(),
    () => prisma.aiConversation.deleteMany(),
    () => prisma.ticketAttachment.deleteMany(),
    () => prisma.ticketMessage.deleteMany(),
    () => prisma.supportTicket.deleteMany(),
    () => prisma.notification.deleteMany(),
    () => prisma.moduleInterest.deleteMany(),
    () => prisma.growthStepState.deleteMany(),
    () => prisma.businessPlan.deleteMany(),
    () => prisma.notificationDelivery.deleteMany(),
    () => prisma.fraudAlert.deleteMany(),
    () => prisma.device.deleteMany(),
    () => prisma.invoice.deleteMany(),
    () => prisma.expense.deleteMany(),
    () => prisma.saleItem.deleteMany(),
    () => prisma.sale.deleteMany(),
    () => prisma.customer.deleteMany(),
    () => prisma.businessGoal.deleteMany(),
    () => prisma.supplier.deleteMany(),
    () => prisma.inventoryMovement.deleteMany(),
    () => prisma.product.deleteMany(),
    () => prisma.business.deleteMany(),
    () => prisma.tontineEvent.deleteMany(),
    () => prisma.tontineContribution.deleteMany(),
    () => prisma.tontineSchedule.deleteMany(),
    () => prisma.tontineJoinRequest.deleteMany(),
    () => prisma.tontineMember.deleteMany(),
    () => prisma.tontine.deleteMany(),
    () => prisma.kycDocument.deleteMany(),
    () => prisma.kycCase.deleteMany(),
    () => prisma.session.deleteMany(),
    () => prisma.otpCode.deleteMany(),
    () => prisma.auditLog.deleteMany(),
    () => prisma.userProfile.deleteMany(),
    () => prisma.user.deleteMany(),
  ];
  for (const s of steps) { try { await s(); } catch { /* ignore */ } }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed désactivé en production.');

  console.log('🧹 Nettoyage…');
  await wipe();

  console.log('👤 Utilisateurs…');
  const kossi = await createUser({ phone: '+22890000001', firstName: 'Kossi', lastName: 'Amétépé', userType: 'SME', kyc: 'VERIFIED', city: 'Lomé', profession: 'Commerçant électronique', score: 812, createdDaysAgo: 210, role: 'BUSINESS_OWNER' });
  const ama = await createUser({ phone: '+22890000002', firstName: 'Ama', lastName: 'Dossou', userType: 'MICRO_ENTERPRISE', kyc: 'VERIFIED', city: 'Lomé', profession: 'Restauratrice', score: 704, createdDaysAgo: 180, role: 'BUSINESS_OWNER' });
  const koffi = await createUser({ phone: '+22890000003', firstName: 'Koffi', lastName: 'Mensah', userType: 'BEGINNER_ENTREPRENEUR', kyc: 'VERIFIED', city: 'Kara', profession: 'Menuisier', score: 566, createdDaysAgo: 90, role: 'TONTINE_MANAGER' });
  const adjoa = await createUser({ phone: '+22890000004', firstName: 'Adjoa', lastName: 'Bello', userType: 'MICRO_ENTERPRISE', kyc: 'IN_PROGRESS', city: 'Kpalimé', profession: 'Couturière', score: 498, createdDaysAgo: 75, role: 'BUSINESS_OWNER' });
  const yao = await createUser({ phone: '+22890000005', firstName: 'Yao', lastName: 'Agbeko', userType: 'INDIVIDUAL', kyc: 'NOT_STARTED', city: 'Sokodé', profession: 'Chauffeur', score: 320, createdDaysAgo: 40 });
  const afiwa = await createUser({ phone: '+22890000006', firstName: 'Afiwa', lastName: 'Kougblenou', userType: 'COOPERATIVE', kyc: 'VERIFIED', city: 'Lomé', profession: 'Présidente de coopérative', score: 758, createdDaysAgo: 240 });
  const sena = await createUser({ phone: '+22890000007', firstName: 'Sena', lastName: 'Lawson', userType: 'SME', kyc: 'VERIFIED', city: 'Lomé', profession: 'Prestataire numérique', score: 690, createdDaysAgo: 150, role: 'BUSINESS_OWNER' });
  const komla = await createUser({ phone: '+22890000008', firstName: 'Komla', lastName: 'Tettey', userType: 'BEGINNER_ENTREPRENEUR', kyc: 'UNDER_REVIEW', city: 'Atakpamé', profession: 'Éleveur', score: 410, createdDaysAgo: 55 });
  const akossiwa = await createUser({ phone: '+22890000009', firstName: 'Akossiwa', lastName: 'Nyavor', userType: 'MICRO_ENTERPRISE', kyc: 'VERIFIED', city: 'Aného', profession: 'Vendeuse de vivres', score: 634, createdDaysAgo: 130 });
  const edem = await createUser({ phone: '+22890000010', firstName: 'Edem', lastName: 'Kodjo', userType: 'INDIVIDUAL', kyc: 'ACTION_REQUIRED', city: 'Lomé', profession: 'Étudiant', score: 275, createdDaysAgo: 30 });
  const rita = await createUser({ phone: '+22890000011', firstName: 'Rita', lastName: 'Amégée', role: 'COMPLIANCE', kyc: 'VERIFIED', city: 'Lomé', profession: 'Analyste conformité KESSIA', createdDaysAgo: 300 });
  const admin = await createUser({ phone: '+22890000000', firstName: 'Admin', lastName: 'KESSIA', role: 'ADMIN', kyc: 'VERIFIED', createdDaysAgo: 300 });

  console.log('💰 Wallets…');
  await seedLedger(kossi.wallet!.id, [
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 250_000, description: 'Dépôt Mobile Money (TMoney)', when: daysAgo(48) },
    { type: 'SALE_PAYMENT', direction: 'CREDIT', amount: 96_000, description: 'Ventes boutique — semaine 12', when: daysAgo(34) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 25_000, description: 'Cotisation « Entrepreneurs de Lomé » — Tour 1', when: daysAgo(30) },
    { type: 'TRANSFER_OUT', direction: 'DEBIT', amount: 35_000, description: 'Transfert vers Adjoa Bello', when: daysAgo(20) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 25_000, description: 'Cotisation « Entrepreneurs de Lomé » — Tour 2', when: daysAgo(3) },
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 40_000, description: 'Dépôt Mobile Money (Flooz)', when: daysAgo(1) },
  ]);
  await seedLedger(ama.wallet!.id, [
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 180_000, description: 'Dépôt bancaire', when: daysAgo(40) },
    { type: 'SALE_PAYMENT', direction: 'CREDIT', amount: 140_000, description: 'Recettes restaurant — février', when: daysAgo(25) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 25_000, description: 'Cotisation « Entrepreneurs de Lomé » — Tour 1', when: daysAgo(30) },
    { type: 'TONTINE_PAYOUT', direction: 'CREDIT', amount: 125_000, description: 'Cagnotte « Entrepreneurs de Lomé » — Tour 1', when: daysAgo(29) },
    { type: 'WITHDRAWAL', direction: 'DEBIT', amount: 60_000, description: 'Retrait espèces — achat de denrées', when: daysAgo(12) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 25_000, description: 'Cotisation « Entrepreneurs de Lomé » — Tour 2', when: daysAgo(2) },
  ]);
  await seedLedger(koffi.wallet!.id, [
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 90_000, description: 'Dépôt Mobile Money', when: daysAgo(35) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 25_000, description: 'Cotisation « Entrepreneurs de Lomé » — Tour 1', when: daysAgo(30) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 10_000, description: 'Cotisation « Hebdo Boutiquiers » — Tour 3', when: daysAgo(14) },
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 20_000, description: 'Dépôt espèces (agent Kara)', when: daysAgo(5) },
  ]);
  await seedLedger(adjoa.wallet!.id, [
    { type: 'TRANSFER_IN', direction: 'CREDIT', amount: 35_000, description: 'Transfert reçu de Kossi Amétépé', when: daysAgo(20) },
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 55_000, description: 'Dépôt Mobile Money', when: daysAgo(10) },
    { type: 'SALE_PAYMENT', direction: 'CREDIT', amount: 42_000, description: 'Couture — commandes de mars', when: daysAgo(6) },
  ]);
  await seedLedger(yao.wallet!.id, [
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 30_000, description: 'Dépôt Mobile Money', when: daysAgo(15) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 10_000, description: 'Cotisation « Hebdo Boutiquiers » — Tour 3', when: daysAgo(13) },
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 100_000, description: 'Dépôt Mobile Money (avance salaire)', when: daysAgo(9) },
  ]);
  await seedLedger(afiwa.wallet!.id, [
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 300_000, description: 'Dépôt bancaire (coopérative)', when: daysAgo(50) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 25_000, description: 'Cotisation « Entrepreneurs de Lomé » — Tour 1', when: daysAgo(30) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 20_000, description: 'Cotisation « Club Croissance Femmes » — Tour 1', when: daysAgo(28) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 20_000, description: 'Cotisation « Club Croissance Femmes » — Tour 2', when: daysAgo(3) },
  ]);
  await seedLedger(sena.wallet!.id, [
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 220_000, description: 'Virement client (prestation site web)', when: daysAgo(30) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 25_000, description: 'Cotisation « Entrepreneurs de Lomé » — Tour 1', when: daysAgo(30) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 25_000, description: 'Cotisation « Entrepreneurs de Lomé » — Tour 2', when: daysAgo(2) },
  ]);
  await seedLedger(komla.wallet!.id, [{ type: 'DEPOSIT', direction: 'CREDIT', amount: 45_000, description: 'Dépôt Mobile Money', when: daysAgo(20) }]);
  await seedLedger(akossiwa.wallet!.id, [
    { type: 'DEPOSIT', direction: 'CREDIT', amount: 75_000, description: 'Dépôt Mobile Money', when: daysAgo(18) },
    { type: 'TONTINE_CONTRIBUTION', direction: 'DEBIT', amount: 10_000, description: 'Cotisation « Hebdo Boutiquiers » — Tour 3', when: daysAgo(14) },
    { type: 'TONTINE_PAYOUT', direction: 'CREDIT', amount: 50_000, description: 'Cagnotte « Hebdo Boutiquiers » — Tour 2', when: daysAgo(21) },
  ]);
  await seedLedger(edem.wallet!.id, [{ type: 'DEPOSIT', direction: 'CREDIT', amount: 12_000, description: 'Dépôt Mobile Money', when: daysAgo(8) }]);
  await seedLedger(rita.wallet!.id, []);
  await seedLedger(admin.wallet!.id, [{ type: 'DEPOSIT', direction: 'CREDIT', amount: 500_000, description: 'Compte de service', when: daysAgo(60) }]);

  console.log('🔄 Tontines…');
  const lome = await seedTontine({
    name: 'Tontine — Entrepreneurs de Lomé', description: 'Tontine mensuelle du groupe des entrepreneurs du quartier Nyékonakpoè.',
    type: 'CLASSIC_ROTATING', amount: 25_000, frequency: 'MONTHLY', maxMembers: 5,
    rules: 'Cotisation due avant le 5 du mois. Un retard de plus de 7 jours entraîne un avertissement du groupe.',
    createdBy: kossi, status: 'ACTIVE', startDaysAgo: 30, currentRound: 2, unpaidPositions: [4],
    members: [
      { user: kossi, joinDaysAgo: 33 }, { user: ama, joinDaysAgo: 33 },
      { user: sena, joinDaysAgo: 32 }, { user: afiwa, joinDaysAgo: 31 }, { user: koffi, joinDaysAgo: 30 },
    ],
  });

  const rentree = await seedTontine({
    name: 'Épargne Rentrée 2026', description: 'Collecte commune pour les fournitures et frais de la rentrée scolaire des enfants du groupe.',
    type: 'PROJECT', amount: 15_000, frequency: 'BIWEEKLY', maxMembers: 8, isPublic: true,
    createdBy: ama, status: 'ACTIVE', startDaysAgo: 6, currentRound: 1, unpaidPositions: [3, 5],
    members: [
      { user: ama, joinDaysAgo: 9 }, { user: kossi, joinDaysAgo: 9 }, { user: adjoa, joinDaysAgo: 8 },
      { user: akossiwa, joinDaysAgo: 7 }, { user: koffi, joinDaysAgo: 6 },
    ],
  });

  const croissance = await seedTontine({
    name: 'Club Croissance Femmes', description: 'Club d’épargne de la coopérative : chaque membre récupère sa mise en fin de cycle.',
    type: 'GROWTH', amount: 20_000, frequency: 'MONTHLY', maxMembers: 6,
    createdBy: afiwa, status: 'ACTIVE', startDaysAgo: 28, currentRound: 2, unpaidPositions: [3],
    members: [
      { user: afiwa, joinDaysAgo: 31 }, { user: adjoa, joinDaysAgo: 30 },
      { user: akossiwa, joinDaysAgo: 29 }, { user: ama, joinDaysAgo: 28 },
    ],
  });

  const achat = await seedTontine({
    name: 'Achat groupé — Congélateurs', description: 'Se regrouper pour acheter des congélateurs à prix négocié, chacun son tour.',
    type: 'PURCHASE', purchaseMode: 'GROUP', amount: 40_000, frequency: 'MONTHLY', maxMembers: 6, isPublic: true,
    membershipConditions: 'Être commerçant·e du marché ou d’un quartier voisin. Disposer d’un local pour recevoir l’appareil. Cotisation de 40 000 FCFA/mois pendant 6 mois.',
    createdBy: koffi, status: 'PENDING', startDaysAgo: -10,
    members: [
      { user: koffi, joinDaysAgo: 5 }, { user: akossiwa, joinDaysAgo: 3 }, { user: adjoa, joinDaysAgo: 2 },
    ],
  });

  // ── Tontines publiques ouvertes — alimentent /discover ──
  const marche = await seedTontine({
    name: 'Tontine des Maraîchères d’Agoè', description: 'Cycle classique : chacune reçoit la cagnotte à son tour pour renforcer son fonds de roulement.',
    type: 'CLASSIC_ROTATING', amount: 15_000, frequency: 'BIWEEKLY', maxMembers: 8, isPublic: true,
    membershipConditions: 'Réservée aux femmes exerçant une activité de maraîchage ou de revente de produits vivriers. Présence obligatoire aux réunions du groupe (2 par mois).',
    rules: 'Cotisation à chaque réunion. Deux absences non justifiées = exclusion.',
    createdBy: ama, status: 'PENDING', startDaysAgo: -14,
    members: [
      { user: ama, joinDaysAgo: 6 }, { user: adjoa, joinDaysAgo: 5 }, { user: akossiwa, joinDaysAgo: 4 },
    ],
  });

  const projetSolaire = await seedTontine({
    name: 'Projet — Kits solaires boutiques', description: 'Collecte commune pour équiper les boutiques du groupe en kits solaires (éclairage + recharge).',
    type: 'PROJECT', amount: 20_000, frequency: 'MONTHLY', maxMembers: 10, isPublic: true,
    membershipConditions: 'Tenir une boutique ou un atelier à Lomé. Objectif d’achat groupé validé ensemble au démarrage.',
    createdBy: afiwa, status: 'PENDING', startDaysAgo: -20,
    members: [
      { user: afiwa, joinDaysAgo: 10 }, { user: sena, joinDaysAgo: 9 },
    ],
  });

  const jeunes = await seedTontine({
    name: 'Épargne Jeunes Entrepreneurs', description: 'Club d’épargne d’encouragement : chacun récupère intégralement sa mise en fin de cycle.',
    type: 'GROWTH', amount: 10_000, frequency: 'MONTHLY', maxMembers: 12, isPublic: true,
    createdBy: koffi, status: 'PENDING', startDaysAgo: -8,
    members: [
      { user: koffi, joinDaysAgo: 4 }, { user: komla, joinDaysAgo: 3 },
    ],
  });

  // Demandes d'adhésion de démonstration
  await prisma.tontineJoinRequest.createMany({
    data: [
      { tontineId: marche.id, userId: sena.id, status: 'PENDING', message: 'Je vends des légumes au marché d’Agoè depuis 4 ans, je serais ravie de rejoindre le groupe.', createdAt: daysAgo(2) },
      { tontineId: marche.id, userId: komla.id, status: 'PENDING', message: 'Bonjour, je livre des produits vivriers, puis-je participer ?', createdAt: daysAgo(1) },
      { tontineId: projetSolaire.id, userId: kossi.id, status: 'PENDING', message: 'Atelier d’électronique à Nyékonakpoè — le kit solaire m’intéresse beaucoup.', createdAt: daysAgo(3) },
      { tontineId: jeunes.id, userId: ama.id, status: 'REJECTED', decisionNote: 'Groupe réservé aux moins de 35 ans pour cette édition.', decidedById: koffi.id, decidedAt: daysAgo(2), createdAt: daysAgo(4) },
    ],
  });

  // Achat individuel (§6.4) — Kossi épargne seul pour un équipement.
  await seedTontine({
    name: 'Mon achat — Presse à jus inox',
    description: 'Plan d’achat individuel : épargne bloquée en séquestre jusqu’au dernier versement.',
    type: 'PURCHASE', purchaseMode: 'SOLO', purchaseItem: 'Presse à jus inox professionnelle',
    targetAmount: 180_000, plannedRounds: 6, amount: 30_000,
    frequency: 'MONTHLY', maxMembers: 1,
    createdBy: kossi, status: 'PENDING', startDaysAgo: -3,
    members: [{ user: kossi, joinDaysAgo: 3 }],
  });

  await seedTontine({
    name: 'Tontine du Marché d’Adawlato', description: 'Cycle terminé — tontine trimestrielle des commerçantes du marché.',
    type: 'CLASSIC_ROTATING', amount: 50_000, frequency: 'MONTHLY', maxMembers: 3,
    createdBy: afiwa, status: 'COMPLETED', startDaysAgo: 130, currentRound: 3,
    members: [
      { user: afiwa, joinDaysAgo: 133 }, { user: ama, joinDaysAgo: 132 }, { user: akossiwa, joinDaysAgo: 131 },
    ],
  });

  const hebdo = await seedTontine({
    name: 'Tontine Hebdo Boutiquiers', description: 'Petite tontine hebdomadaire entre boutiquiers voisins.',
    type: 'CLASSIC_ROTATING', amount: 10_000, frequency: 'WEEKLY', maxMembers: 6,
    createdBy: akossiwa, status: 'ACTIVE', startDaysAgo: 35, currentRound: 4,
    unpaidPositions: [2], latePositions: [3],
    members: [
      { user: akossiwa, joinDaysAgo: 38 }, { user: koffi, joinDaysAgo: 37 },
      { user: yao, joinDaysAgo: 36 }, { user: adjoa, joinDaysAgo: 35 },
      { user: komla, joinDaysAgo: 34 }, { user: edem, joinDaysAgo: 33 },
    ],
  });

  console.log('🛟 Fonds de Garantie Solidaire (démonstration)…');
  // Demande en attente — Yao, retard sur « Hebdo Boutiquiers » tour 4
  const claim1 = await prisma.guaranteeClaim.create({
    data: {
      userId: yao.id, tontineId: hebdo.id, round: 4, amountRequested: dec(10_000),
      reason: 'Retard de paiement de mon employeur ce mois-ci, je régularise dès réception.',
      status: 'PENDING', simulated: true, createdAt: daysAgo(1),
    },
  });
  await prisma.guaranteeEvent.create({ data: { type: 'CLAIM_OPENED', claimId: claim1.id, actorId: yao.id, amount: dec(10_000), createdAt: daysAgo(1) } });
  await prisma.tontineEvent.create({ data: { tontineId: hebdo.id, type: 'GUARANTEE_CLAIM', actorId: yao.id, round: 4, amount: dec(10_000), createdAt: daysAgo(1) } });

  // Demande approuvée (réglée en simulation) — Akossiwa
  const claim2 = await prisma.guaranteeClaim.create({
    data: {
      userId: akossiwa.id, tontineId: hebdo.id, round: 2, amountRequested: dec(10_000),
      reason: 'Dépense de santé imprévue pour mon enfant, je rembourse la semaine prochaine.',
      status: 'SETTLED', simulated: true, reviewedById: rita.id, reviewedAt: daysAgo(18),
      decisionNote: 'Situation vérifiée, membre à jour de ses autres engagements. Couverture accordée.',
      createdAt: daysAgo(20),
    },
  });
  await prisma.guaranteeEvent.createMany({
    data: [
      { type: 'CLAIM_OPENED', claimId: claim2.id, actorId: akossiwa.id, amount: dec(10_000), createdAt: daysAgo(20) },
      { type: 'CLAIM_APPROVED', claimId: claim2.id, actorId: rita.id, amount: dec(10_000), createdAt: daysAgo(18) },
      { type: 'CLAIM_SETTLED', claimId: claim2.id, actorId: rita.id, amount: dec(10_000), createdAt: daysAgo(18), metadata: { mode: 'simulation' } as never },
    ],
  });

  // Demande refusée — Komla
  const claim3 = await prisma.guaranteeClaim.create({
    data: {
      userId: komla.id, tontineId: hebdo.id, round: 3, amountRequested: dec(10_000),
      reason: 'Je préfère utiliser le fonds plutôt que mon épargne.',
      status: 'REJECTED', simulated: true, reviewedById: rita.id, reviewedAt: daysAgo(6),
      decisionNote: 'Le fonds est réservé aux difficultés ponctuelles avérées. Solde wallet suffisant constaté.',
      createdAt: daysAgo(8),
    },
  });
  await prisma.guaranteeEvent.createMany({
    data: [
      { type: 'CLAIM_OPENED', claimId: claim3.id, actorId: komla.id, amount: dec(10_000), createdAt: daysAgo(8) },
      { type: 'CLAIM_REJECTED', claimId: claim3.id, actorId: rita.id, amount: dec(10_000), createdAt: daysAgo(6) },
    ],
  });

  console.log('🛡️ Anti-fraude (démonstration)…');
  await prisma.device.createMany({
    data: [
      { userId: kossi.id, fingerprint: 'seedfp-kossi-phone', userAgent: 'Mozilla/5.0 (Android)', trusted: true, seenCount: 42, firstSeenAt: daysAgo(200), lastSeenAt: daysAgo(0) },
      { userId: ama.id, fingerprint: 'seedfp-ama-phone', userAgent: 'Mozilla/5.0 (iPhone)', trusted: true, seenCount: 30, firstSeenAt: daysAgo(150), lastSeenAt: daysAgo(1) },
      { userId: yao.id, fingerprint: 'seedfp-yao-phone', userAgent: 'Mozilla/5.0 (Android)', trusted: true, seenCount: 8, firstSeenAt: daysAgo(40), lastSeenAt: daysAgo(2) },
    ],
  });
  await prisma.fraudAlert.create({
    data: {
      userId: yao.id, riskLevel: 'HIGH', score: 60, context: 'transfer',
      signals: [
        { type: 'new_device', label: 'Appareil jamais utilisé sur ce compte', weight: 25 },
        { type: 'velocity', label: '3 transferts en moins de 10 minutes', weight: 30 },
      ] as never,
      status: 'OPEN', createdAt: daysAgo(1),
    },
  });
  await prisma.fraudAlert.create({
    data: {
      userId: komla.id, riskLevel: 'MEDIUM', score: 35, context: 'login',
      signals: [
        { type: 'new_device', label: 'Appareil jamais utilisé sur ce compte', weight: 15 },
        { type: 'failed_logins', label: '5 échecs de connexion récents', weight: 20 },
      ] as never,
      status: 'DISMISSED', reviewedById: rita.id, reviewedAt: daysAgo(3),
      decisionNote: 'Membre a confirmé un changement de téléphone. Rien d’anormal.',
      createdAt: daysAgo(4),
    },
  });

  console.log('🏪 Entreprises…');
  await seedBusiness({
    owner: kossi, name: 'Kossi Électro', sector: 'Commerce — électronique', city: 'Lomé', phone: '+22890000001',
    products: [
      { name: 'Ampoule LED 9W', price: 1_500, cost: 900, stock: 46, category: 'Éclairage' },
      { name: 'Rallonge multiprise 3m', price: 6_500, cost: 4_200, stock: 9, category: 'Câblage' },
      { name: 'Batterie solaire 12V 100Ah', price: 185_000, cost: 138_000, stock: 2, category: 'Solaire' },
      { name: 'Panneau solaire 150W', price: 95_000, cost: 71_000, stock: 5, category: 'Solaire' },
      { name: 'Ventilateur de table', price: 18_000, cost: 12_500, stock: 11, category: 'Ventilation' },
      { name: 'Régulateur de tension 1000VA', price: 32_000, cost: 24_000, stock: 6, category: 'Protection' },
    ],
    sales: [
      { items: [['Ampoule LED 9W', 10]], method: 'CASH', days: 22 },
      { items: [['Ventilateur de table', 2], ['Rallonge multiprise 3m', 1]], method: 'MOBILE_MONEY', days: 15 },
      { items: [['Panneau solaire 150W', 1]], method: 'MOBILE_MONEY', days: 9, customer: 'Chantier BTP Agoè' },
      { items: [['Ampoule LED 9W', 8], ['Régulateur de tension 1000VA', 1]], method: 'CASH', days: 4 },
      { items: [['Batterie solaire 12V 100Ah', 1]], method: 'BANK_TRANSFER', days: 1, customer: 'Pharmacie du Port' },
    ],
    suppliers: [
      { name: 'Import Élec Sino-Togo', category: 'Grossiste électronique', phone: '+22892110045' },
      { name: 'SolarPro Bénin', category: 'Matériel solaire', phone: '+22997220011' },
      { name: 'Régie CEET', category: 'Électricité' },
    ],
    expenses: [
      { category: 'Loyer', amount: 45_000, days: 12 },
      { category: 'Achats', amount: 480_000, description: 'Conteneur batteries + panneaux', days: 40, supplier: 'SolarPro Bénin' },
      { category: 'Achats', amount: 120_000, description: 'Lot ampoules + rallonges', days: 18, supplier: 'Import Élec Sino-Togo' },
      { category: 'Transport', amount: 9_000, description: 'Réassort marché Assigamé', days: 6 },
      { category: 'Électricité', amount: 21_500, days: 3, supplier: 'Régie CEET' },
    ],
    customers: [
      { name: 'Chantier BTP Agoè', type: 'CLIENT', phone: '+22890445512', notes: 'Paye toujours par virement, sous 30 j.' },
      { name: 'Pharmacie du Port', type: 'CLIENT', phone: '+22890778820', followUpInDays: 4, followUpNote: 'Relancer pour le règlement de la facture batterie.' },
      { name: 'Église Béthel Adidogomé', type: 'CLIENT', followUpInDays: -3, followUpNote: 'Facture ampoules en retard — appeler le trésorier.' },
      { name: 'Lycée Technique de Lomé', type: 'PROSPECT', notes: 'Demande un devis pour équiper 4 salles en solaire.' },
    ],
    goals: [
      { metric: 'REVENUE', period: 'MONTH', target: 900_000, label: 'CA boutique' },
      { metric: 'MARGIN_RATE', period: 'QUARTER', target: 28 },
      { metric: 'NEW_CUSTOMERS', period: 'QUARTER', target: 6 },
    ],
    invoices: [
      { customer: 'Chantier BTP Agoè', lines: [['Panneau solaire 150W', 3, 95_000]], status: 'PAID', days: 20 },
      { customer: 'Pharmacie du Port', lines: [['Batterie solaire 12V 100Ah', 1, 185_000], ['Régulateur de tension 1000VA', 1, 32_000]], status: 'SENT', dueDays: 10, days: 2 },
      { customer: 'Église Béthel Adidogomé', lines: [['Ampoule LED 9W', 40, 1_400]], status: 'OVERDUE', dueDays: -8, days: 25 },
      { customer: 'Lycée Technique de Lomé', kind: 'QUOTE', lines: [['Panneau solaire 150W', 8, 95_000], ['Batterie solaire 12V 100Ah', 4, 185_000], ['Régulateur de tension 1000VA', 4, 32_000]], status: 'SENT', dueDays: 20, days: 3 },
    ],
  });

  await seedBusiness({
    owner: ama, name: 'Chez Ama — Maquis & Traiteur', sector: 'Restauration', city: 'Lomé', phone: '+22890000002',
    products: [
      { name: 'Plat du jour (riz sauce)', price: 1_000, cost: 550, stock: 0, category: 'Plats' },
      { name: 'Poulet braisé', price: 3_500, cost: 2_100, stock: 0, category: 'Plats' },
      { name: 'Poisson braisé', price: 3_000, cost: 1_900, stock: 0, category: 'Plats' },
      { name: 'Jus de bissap 1L', price: 1_500, cost: 700, stock: 24, category: 'Boissons' },
      { name: 'Plateau traiteur (10 pers.)', price: 45_000, cost: 28_000, stock: 0, category: 'Traiteur' },
    ],
    sales: [
      { items: [['Plat du jour (riz sauce)', 32]], method: 'CASH', days: 6 },
      { items: [['Poulet braisé', 8], ['Jus de bissap 1L', 5]], method: 'MOBILE_MONEY', days: 5 },
      { items: [['Plateau traiteur (10 pers.)', 2]], method: 'MOBILE_MONEY', days: 3, customer: 'Cabinet Notarial Kékéli' },
      { items: [['Plat du jour (riz sauce)', 28], ['Poisson braisé', 6]], method: 'CASH', days: 1 },
    ],
    suppliers: [
      { name: 'Marché de gros Adawlato', category: 'Denrées', phone: '+22890112233' },
      { name: 'Gaz Oryx Lomé', category: 'Gaz' },
    ],
    expenses: [
      { category: 'Achats denrées', amount: 60_000, description: 'Marché de gros', days: 12, supplier: 'Marché de gros Adawlato' },
      { category: 'Achats denrées', amount: 55_000, description: 'Poissons + volaille', days: 4, supplier: 'Marché de gros Adawlato' },
      { category: 'Gaz', amount: 12_000, days: 8, supplier: 'Gaz Oryx Lomé' },
      { category: 'Salaires', amount: 35_000, description: 'Aide-cuisine', days: 2 },
    ],
    customers: [
      { name: 'Cabinet Notarial Kékéli', type: 'CLIENT', phone: '+22890665544', notes: 'Commande un plateau traiteur chaque fin de mois.' },
      { name: 'École Les Anges', type: 'CLIENT', phone: '+22890221100', followUpInDays: 2, followUpNote: 'Confirmer la commande de cantine de la semaine.' },
      { name: 'Mairie de Golfe 2', type: 'PROSPECT', notes: 'Cherche un traiteur pour un séminaire de 80 personnes.' },
    ],
    goals: [
      { metric: 'REVENUE', period: 'MONTH', target: 350_000, label: 'CA maquis + traiteur' },
      { metric: 'SALES_COUNT', period: 'MONTH', target: 40 },
    ],
    invoices: [
      { customer: 'Cabinet Notarial Kékéli', lines: [['Plateau traiteur (10 pers.)', 4, 45_000]], status: 'PAID', days: 14 },
      { customer: 'École Les Anges', lines: [['Plat du jour (riz sauce)', 60, 950]], status: 'SENT', dueDays: 7, days: 3 },
      { customer: 'Mairie de Golfe 2', kind: 'QUOTE', lines: [['Plateau traiteur (10 pers.)', 8, 44_000]], status: 'SENT', dueDays: 15, days: 5 },
    ],
  });

  await seedBusiness({
    owner: adjoa, name: 'Atelier Adjoa Couture', sector: 'Artisanat — couture', city: 'Kpalimé', phone: '+22890000004',
    products: [
      { name: 'Robe pagne sur mesure', price: 12_000, cost: 6_500, stock: 0, category: 'Confection' },
      { name: 'Chemise homme', price: 8_000, cost: 4_000, stock: 0, category: 'Confection' },
      { name: 'Retouche / ourlet', price: 1_500, cost: 300, stock: 0, category: 'Retouche' },
      { name: 'Uniforme scolaire (pièce)', price: 6_000, cost: 3_200, stock: 0, category: 'Uniformes' },
    ],
    sales: [
      { items: [['Robe pagne sur mesure', 2]], method: 'MOBILE_MONEY', days: 8 },
      { items: [['Retouche / ourlet', 9]], method: 'CASH', days: 5 },
      { items: [['Uniforme scolaire (pièce)', 6]], method: 'CASH', days: 2, customer: 'Collège Privé Espoir' },
    ],
    suppliers: [
      { name: 'Tissus Woodin Kpalimé', category: 'Tissus', phone: '+22890909012' },
    ],
    expenses: [
      { category: 'Fournitures', amount: 22_000, description: 'Pagne + fil + boutons', days: 10, supplier: 'Tissus Woodin Kpalimé' },
      { category: 'Électricité', amount: 6_000, description: 'Atelier', days: 4 },
    ],
    customers: [
      { name: 'Collège Privé Espoir', type: 'CLIENT', phone: '+22890334455', followUpInDays: -2, followUpNote: 'Facture uniformes en retard depuis 5 j.' },
      { name: 'Association des Femmes de Kloto', type: 'PROSPECT', notes: 'Intéressée par 30 tenues identiques pour une cérémonie.' },
    ],
    goals: [
      { metric: 'REVENUE', period: 'MONTH', target: 120_000, label: 'CA atelier' },
      { metric: 'NEW_CUSTOMERS', period: 'QUARTER', target: 4 },
    ],
    invoices: [
      { customer: 'Collège Privé Espoir', lines: [['Uniforme scolaire (pièce)', 40, 5_800]], status: 'OVERDUE', dueDays: -5, days: 18 },
      { customer: 'Association des Femmes de Kloto', kind: 'QUOTE', lines: [['Robe pagne sur mesure', 30, 11_000]], status: 'DRAFT', days: 2 },
    ],
  });

  await seedBusiness({
    owner: sena, name: 'Lawson Digital', sector: 'Services numériques', city: 'Lomé', phone: '+22890000007',
    products: [
      { name: 'Création site vitrine', price: 250_000, cost: 90_000, stock: 0, category: 'Web' },
      { name: 'Community management (mois)', price: 60_000, cost: 20_000, stock: 0, category: 'Marketing' },
      { name: 'Formation bureautique (jour)', price: 30_000, cost: 8_000, stock: 0, category: 'Formation' },
    ],
    sales: [
      { items: [['Création site vitrine', 1]], method: 'BANK_TRANSFER', days: 26, customer: 'Hôtel La Palmeraie' },
      { items: [['Community management (mois)', 2]], method: 'MOBILE_MONEY', days: 10, customer: 'Boutique Zita Mode' },
    ],
    suppliers: [
      { name: 'Canal Box Togo', category: 'Internet', phone: '+22892000100' },
      { name: 'Adobe / Canva (abonnements)', category: 'Logiciels' },
    ],
    expenses: [
      { category: 'Fournitures', amount: 18_000, description: 'Abonnements logiciels', days: 15, supplier: 'Adobe / Canva (abonnements)' },
      { category: 'Autre', amount: 25_000, description: 'Connexion internet fibre', days: 5, supplier: 'Canal Box Togo' },
    ],
    customers: [
      { name: 'Hôtel La Palmeraie', type: 'CLIENT', phone: '+22890555001', notes: 'Site livré, envisage un contrat de maintenance annuel.' },
      { name: 'Boutique Zita Mode', type: 'CLIENT', phone: '+22890555002', followUpInDays: 6, followUpNote: 'Proposer le renouvellement community management.' },
      { name: 'ONG Jeunesse & Avenir', type: 'PROSPECT', notes: 'Besoin d’un site + formation bureautique pour 5 agents.' },
    ],
    goals: [
      { metric: 'REVENUE', period: 'QUARTER', target: 1_200_000, label: 'CA prestations' },
      { metric: 'MARGIN_RATE', period: 'QUARTER', target: 55 },
    ],
    invoices: [
      { customer: 'Hôtel La Palmeraie', lines: [['Création site vitrine', 1, 250_000]], status: 'PAID', days: 24 },
      { customer: 'Boutique Zita Mode', lines: [['Community management (mois)', 3, 60_000]], status: 'SENT', dueDays: 12, days: 4 },
      { customer: 'ONG Jeunesse & Avenir', kind: 'QUOTE', lines: [['Création site vitrine', 1, 250_000], ['Formation bureautique (jour)', 3, 30_000]], status: 'SENT', dueDays: 25, days: 6 },
    ],
  });

  console.log('🔔 Notifications & support…');
  await prisma.notification.createMany({
    data: [
      { userId: kossi.id, category: 'TONTINE', priority: 'HIGH', title: 'Cotisation à venir', body: 'Cotisation « Tontine du Marché d’Adawlato » — 50 000 FCFA due dans 3 jours.', actionUrl: `/tontine/${lome.id}`, createdAt: daysAgo(1) },
      { userId: kossi.id, category: 'PAYMENT', priority: 'NORMAL', title: 'Dépôt confirmé', body: 'Votre dépôt de 40 000 FCFA a été crédité.', createdAt: daysAgo(1) },
      { userId: kossi.id, category: 'BUSINESS', priority: 'NORMAL', title: 'Stock faible', body: 'Kossi Électro : « Batterie solaire 12V 100Ah » — 2 unités restantes.', actionUrl: '/business', isRead: true, readAt: daysAgo(2), createdAt: daysAgo(3) },
      { userId: ama.id, category: 'TONTINE', priority: 'HIGH', title: 'Cagnotte reçue 🎉', body: '125 000 FCFA versés sur votre wallet — « Entrepreneurs de Lomé », tour 1.', actionUrl: '/wallet', createdAt: daysAgo(29) },
      { userId: yao.id, category: 'SYSTEM', priority: 'NORMAL', title: 'Fonds de Garantie — demande reçue', body: 'Votre demande d’aide (10 000 FCFA) est en cours d’examen.', actionUrl: '/tontine/garantie', createdAt: daysAgo(1) },
      { userId: adjoa.id, category: 'SYSTEM', priority: 'HIGH', title: 'Fonds de Garantie — demande approuvée', body: 'Votre demande de 20 000 FCFA a été approuvée (mode démonstration).', actionUrl: '/tontine/garantie', isRead: true, readAt: daysAgo(8), createdAt: daysAgo(9) },
      { userId: edem.id, category: 'SECURITY', priority: 'HIGH', title: 'Vérification KYC — action requise', body: 'La photo de votre pièce d’identité est floue. Reprenez-la à la lumière du jour.', actionUrl: '/profile/kyc', createdAt: daysAgo(5) },
      { userId: rita.id, category: 'SYSTEM', priority: 'NORMAL', title: 'Fonds de Garantie — demande à examiner', body: 'Nouvelle demande de Yao Agbeko (10 000 FCFA).', actionUrl: '/admin/guarantee', createdAt: daysAgo(1) },
    ],
  });

  const t1 = await prisma.supportTicket.create({
    data: {
      ticketNumber: `KSS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-0001`,
      userId: adjoa.id, category: 'KYC', priority: 'NORMAL', status: 'WAITING',
      subject: 'Ma vérification KYC est bloquée', description: 'J’ai envoyé ma carte d’identité et mon selfie il y a 3 jours, le statut est toujours « en cours ».',
      assignedToId: admin.id, createdAt: daysAgo(4),
    },
  });
  await prisma.ticketMessage.createMany({
    data: [
      { ticketId: t1.id, authorId: adjoa.id, content: 'Bonjour, ma vérification KYC est bloquée depuis 3 jours.', createdAt: daysAgo(4) },
      { ticketId: t1.id, authorId: admin.id, content: 'Bonjour Adjoa, votre dossier est en file de revue. Nous revenons vers vous sous 48 h.', createdAt: daysAgo(3) },
      { ticketId: t1.id, authorId: admin.id, content: 'Note interne : justificatif de domicile manquant pour le niveau 2.', isInternal: true, createdAt: daysAgo(3) },
    ],
  });
  // Pièce jointe de démonstration (§46) — repli data-URI (PNG 1×1).
  await prisma.ticketAttachment.create({
    data: {
      ticketId: t1.id, uploadedById: adjoa.id,
      fileName: 'capture-statut-kyc.png', mimeType: 'image/png', size: 68,
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      createdAt: daysAgo(4),
    },
  });
  await prisma.supportTicket.create({
    data: {
      ticketNumber: `KSS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-0002`,
      userId: yao.id, category: 'TONTINE', priority: 'HIGH', status: 'OPEN',
      subject: 'Comment fonctionne le Fonds de Garantie ?', description: 'On m’a parlé du Fonds de Garantie Solidaire, je voudrais comprendre si je peux en bénéficier ce mois-ci.',
      createdAt: daysAgo(1),
    },
  });
  await prisma.supportTicket.create({
    data: {
      ticketNumber: `KSS-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-0003`,
      userId: kossi.id, category: 'BUSINESS', priority: 'LOW', status: 'RESOLVED',
      subject: 'Exporter mes factures', description: 'Est-il possible d’exporter les factures du mois en PDF ?',
      resolvedAt: daysAgo(2), createdAt: daysAgo(6),
    },
  });

  console.log('🧩 Intérêt pour les modules à venir…');
  await prisma.moduleInterest.createMany({
    data: [
      { userId: kossi.id, module: 'market', createdAt: daysAgo(9) },
      { userId: kossi.id, module: 'jobs', createdAt: daysAgo(9) },
      { userId: ama.id, module: 'market', createdAt: daysAgo(7) },
      { userId: ama.id, module: 'learn', createdAt: daysAgo(7) },
      { userId: adjoa.id, module: 'market', createdAt: daysAgo(5) },
      { userId: adjoa.id, module: 'community', createdAt: daysAgo(5) },
      { userId: koffi.id, module: 'learn', createdAt: daysAgo(12) },
      { userId: sena.id, module: 'jobs', createdAt: daysAgo(3) },
      { userId: sena.id, module: 'community', createdAt: daysAgo(3) },
      { userId: afiwa.id, module: 'learn', createdAt: daysAgo(15) },
      { userId: afiwa.id, module: 'invest', createdAt: daysAgo(15) },
      { userId: yao.id, module: 'jobs', createdAt: daysAgo(2) },
      { userId: komla.id, module: 'insurance', createdAt: daysAgo(6) },
      { userId: akossiwa.id, module: 'market', createdAt: daysAgo(4) },
      { userId: edem.id, module: 'jobs', createdAt: daysAgo(1) },
      { userId: edem.id, module: 'learn', createdAt: daysAgo(1) },
    ],
  });

  console.log('🌱 Plans de croissance…');
  await prisma.growthStepState.createMany({
    data: [
      { userId: kossi.id, stepKey: 'enable-2fa', status: 'DOING', note: 'Je configure Google Authenticator ce week-end.', createdAt: daysAgo(4) },
      { userId: kossi.id, stepKey: 'simulate-goal', status: 'DONE', completedAt: daysAgo(2), createdAt: daysAgo(6) },
      { userId: ama.id, stepKey: 'wallet-regular', status: 'DOING', createdAt: daysAgo(5) },
      { userId: yao.id, stepKey: 'tontine-catchup', status: 'DOING', note: 'Je régularise dès réception du salaire.', createdAt: daysAgo(1) },
    ],
  });

  console.log('\n✅ Seed terminé — 12 comptes, 10 tontines (dont 1 achat individuel + 4 publiques ouvertes), demandes d’adhésion, 4 entreprises, Fonds de Garantie (démo).\n');
  console.table([
    { Rôle: 'Membre (SME)', Téléphone: '+22890000001', Nom: 'Kossi Amétépé' },
    { Rôle: 'Membre (Micro)', Téléphone: '+22890000002', Nom: 'Ama Dossou' },
    { Rôle: 'Membre (Coop.)', Téléphone: '+22890000006', Nom: 'Afiwa Kougblenou' },
    { Rôle: 'Membre (retard)', Téléphone: '+22890000005', Nom: 'Yao Agbeko' },
    { Rôle: 'Conformité', Téléphone: '+22890000011', Nom: 'Rita Amégée' },
    { Rôle: 'Admin', Téléphone: '+22890000000', Nom: 'Admin KESSIA' },
  ]);
  console.log(`Mot de passe commun : ${DEMO_PASSWORD}\n`);
}

// ── Entreprise clé-en-main ──────────────────────────────────

type SeedCustomer =
  | string
  | { name: string; type?: 'PROSPECT' | 'CLIENT'; phone?: string; address?: string; notes?: string; followUpInDays?: number; followUpNote?: string };

async function seedBusiness(o: {
  owner: { id: string }; name: string; sector: string; city: string; phone: string;
  products: { name: string; price: number; cost: number; stock: number; category: string }[];
  sales: { items: [string, number][]; method: string; days: number; customer?: string }[];
  expenses: { category: string; amount: number; description?: string; days: number; supplier?: string }[];
  customers: SeedCustomer[];
  suppliers?: { name: string; category?: string; phone?: string; notes?: string }[];
  goals?: { metric: 'REVENUE' | 'MARGIN_RATE' | 'SALES_COUNT' | 'NEW_CUSTOMERS'; period: 'MONTH' | 'QUARTER' | 'YEAR'; target: number; label?: string }[];
  invoices: { customer: string; kind?: 'QUOTE' | 'INVOICE'; lines: [string, number, number][]; status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED'; days: number; dueDays?: number }[];
}) {
  const normCustomers = o.customers.map((c) => (typeof c === 'string' ? { name: c } : c));

  const biz = await prisma.business.create({
    data: {
      userId: o.owner.id, name: o.name, sector: o.sector, city: o.city, phone: o.phone, status: 'ACTIVE',
      products: { create: o.products.map((p) => ({ name: p.name, price: dec(p.price), cost: dec(p.cost), stock: p.stock, category: p.category })) },
      customers: {
        create: normCustomers.map((c) => ({
          name: c.name,
          type: c.type ?? 'CLIENT',
          phone: c.phone ?? null,
          address: c.address ?? null,
          notes: c.notes ?? null,
          nextFollowUpAt: c.followUpInDays !== undefined ? daysFromNow(c.followUpInDays) : null,
          followUpNote: c.followUpNote ?? null,
        })),
      },
      suppliers: { create: (o.suppliers ?? []).map((s) => ({ name: s.name, category: s.category ?? null, phone: s.phone ?? null, notes: s.notes ?? null })) },
    },
    include: { products: true, customers: true, suppliers: true },
  });
  const prod = Object.fromEntries(biz.products.map((p) => [p.name, p]));
  const cust = Object.fromEntries(biz.customers.map((c) => [c.name, c]));
  const supp = Object.fromEntries(biz.suppliers.map((s) => [s.name, s]));

  if (o.goals?.length) {
    await prisma.businessGoal.createMany({
      data: o.goals.map((g) => {
        const { start, end } = goalPeriodBounds(g.period);
        return { businessId: biz.id, metric: g.metric, period: g.period, targetValue: dec(g.target), label: g.label ?? null, startDate: start, endDate: end };
      }),
    });
  }

  for (const s of o.sales) {
    const total = s.items.reduce((sum, [name, qty]) => sum + Number(prod[name].price) * qty, 0);
    await prisma.sale.create({
      data: {
        businessId: biz.id, totalAmount: dec(total), paymentMethod: s.method, status: 'COMPLETED',
        customerId: s.customer ? cust[s.customer]?.id : undefined,
        createdAt: daysAgo(s.days),
        items: { create: s.items.map(([name, qty]) => ({ productId: prod[name].id, quantity: qty, unitPrice: prod[name].price, totalPrice: dec(Number(prod[name].price) * qty) })) },
      },
    });
    for (const [name, qty] of s.items) {
      if (prod[name].stock > 0) await prisma.product.update({ where: { id: prod[name].id }, data: { stock: { decrement: Math.min(qty, prod[name].stock) } } });
    }
  }

  await prisma.expense.createMany({
    data: o.expenses.map((e) => ({
      businessId: biz.id, category: e.category, amount: dec(e.amount), description: e.description,
      supplierId: e.supplier ? supp[e.supplier]?.id ?? null : null,
      date: daysAgo(e.days),
    })),
  });

  const seq = { QUOTE: 0, INVOICE: 0 };
  for (const inv of o.invoices) {
    const kind = inv.kind ?? 'INVOICE';
    const prefix = kind === 'QUOTE' ? 'DEV' : 'FAC';
    seq[kind] += 1;
    const subtotal = inv.lines.reduce((s, [, qty, price]) => s + qty * price, 0);
    const tax = Math.round(subtotal * 0.18);
    await prisma.invoice.create({
      data: {
        businessId: biz.id,
        invoiceNumber: `${prefix}-${new Date().getFullYear()}-${String(seq[kind]).padStart(4, '0')}`,
        kind,
        customerId: cust[inv.customer]?.id, customerName: inv.customer,
        items: inv.lines.map(([name, qty, price]) => ({ name, quantity: qty, unitPrice: price, total: qty * price })) as unknown as Prisma.InputJsonValue,
        subtotal: dec(subtotal), tax: dec(tax), total: dec(subtotal + tax),
        status: inv.status,
        dueDate: inv.dueDays !== undefined ? daysFromNow(inv.dueDays) : null,
        paidAt: inv.status === 'PAID' ? daysAgo(inv.days - 2) : null,
        issuedAt: daysAgo(inv.days), createdAt: daysAgo(inv.days),
      },
    });
  }

  // Brouillon de plan d'affaires (§17), généré à partir de l'ADN
  const planDraft = await generateBusinessPlanDraft(biz.id);
  if (planDraft) {
    await prisma.businessPlan.create({
      data: { businessId: biz.id, content: planDraft as unknown as Prisma.InputJsonValue },
    });
  }
}

function goalPeriodBounds(period: 'MONTH' | 'QUARTER' | 'YEAR'): { start: Date; end: Date } {
  const ref = new Date();
  const y = ref.getFullYear();
  if (period === 'MONTH') return { start: new Date(y, ref.getMonth(), 1), end: new Date(y, ref.getMonth() + 1, 1) };
  if (period === 'QUARTER') {
    const q = Math.floor(ref.getMonth() / 3);
    return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 1) };
  }
  return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
}

main()
  .catch((e) => { console.error('❌ Seed échoué :', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
