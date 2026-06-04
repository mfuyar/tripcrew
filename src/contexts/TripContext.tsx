import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import { Trip, TripMember, Family, FamilyMember, TripRole } from '../types';
import { useAuth } from './AuthContext';

interface TripContextValue {
  currentTrip: Trip | null;
  setCurrentTrip: (trip: Trip | null) => void;
  members: TripMember[];
  setMembers: (members: TripMember[]) => void;
  families: Family[];
  setFamilies: (families: Family[]) => void;
  userFamily: Family | null;
  userRole: TripRole | null;
  isTripOrganizer: boolean;
  isTripAdmin: boolean;
  canManageAnnouncements: boolean;
  canManageTrip: boolean;
  getFamilyById: (id: string) => Family | undefined;
  refreshTripData: (() => void) | null;
  setRefreshTripData: (fn: (() => void) | null) => void;
}

const TripContext = createContext<TripContextValue | undefined>(undefined);

export function TripProvider({ children }: { children: ReactNode }) {
  const { user, isGlobalAdmin } = useAuth();
  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [refreshTripData, setRefreshTripData] = useState<(() => void) | null>(null);

  // Derive userFamily and userRole from members list
  const currentMember = members.find((m) => m.user_id === user?.id);
  const userFamily = currentMember?.family_id
    ? families.find((f) => f.id === currentMember.family_id) ?? null
    : null;
  const userRole: TripRole | null = currentMember?.role ?? null;
  const isTripOrganizer = userRole === 'trip_organizer';
  const isTripAdmin = userRole === 'trip_admin';
  const canManageAnnouncements = isTripOrganizer || isTripAdmin || isGlobalAdmin;
  const canManageTrip = isTripOrganizer || isTripAdmin || isGlobalAdmin;

  const getFamilyById = useCallback(
    (id: string) => families.find((f) => f.id === id),
    [families]
  );

  return (
    <TripContext.Provider
      value={{
        currentTrip,
        setCurrentTrip,
        members,
        setMembers,
        families,
        setFamilies,
        userFamily,
        userRole,
        isTripOrganizer,
        isTripAdmin,
        canManageAnnouncements,
        canManageTrip,
        getFamilyById,
        refreshTripData,
        setRefreshTripData,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTripContext(): TripContextValue {
  const ctx = useContext(TripContext);
  if (!ctx) throw new Error('useTripContext must be used inside TripProvider');
  return ctx;
}
