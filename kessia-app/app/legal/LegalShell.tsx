'use client';

import Link from 'next/link';
import styles from './legal.module.css';

export default function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <Link href="/" className={styles.back}>← KESSIA</Link>
        <span className={styles.brand}>Documents juridiques</span>
        <button className={styles.printBtn} onClick={() => window.print()}>Imprimer / PDF</button>
      </div>
      <div className={styles.wrap}>
        <div className={styles.draft}>
          <strong>Projet — version de travail.</strong> Ce document doit être validé par un conseil
          juridique compétent au Togo (puis dans chaque pays d’exploitation) avant toute mise en
          production. Il n’a pas de valeur contractuelle en l’état.
        </div>
        <h1 className={styles.h1}>{title}</h1>
        <div className={styles.meta}>KESSIA · Dernière révision : {updated}</div>
        <div className={styles.doc}>{children}</div>
      </div>
    </div>
  );
}
