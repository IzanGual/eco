import { createContext, useContext } from 'react';
import type { Transaction, TxType, CatType } from './db';

export type Screen =
  | { name: 'editor'; id?: number; type?: TxType; defaults?: Partial<Transaction> }
  | { name: 'wallets' }
  | { name: 'walletEdit'; id?: number }
  | { name: 'categories' }
  | { name: 'categoryEdit'; id?: number; parentId?: number | null; type?: CatType }
  | { name: 'budgets' }
  | { name: 'budgetEdit'; id?: number }
  | { name: 'recurring' }
  | { name: 'summary'; kind: 'week' | 'month'; offset: number }
  | { name: 'filtered'; title: string; categoryId?: number; walletId?: number; start?: string; end?: string };

export interface Nav {
  push: (s: Screen) => void;
  pop: () => void;
}

export const NavCtx = createContext<Nav>({ push: () => {}, pop: () => {} });
export const useNav = () => useContext(NavCtx);
