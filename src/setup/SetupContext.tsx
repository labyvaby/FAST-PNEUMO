import React, { createContext, ReactNode, useEffect, useMemo, useState } from 'react';
import { ValveParams } from '../lib/valveModel';
import { LineSetup, SETUP_STORAGE_KEY, StandSetup, StandView, describeSetup, loadSetup, DEFAULT_SETUP } from './setup';

interface SetupContextValue extends StandView {
  /** правка параметров вручную: сбрасывает отметку о калибровке, если меняется не только давление */
  updateParams: (patch: Partial<ValveParams>) => void;
  /** параметры, подобранные под даташит распределителя valveId */
  applyCalibration: (params: ValveParams, valveId: string) => void;
  selectValve: (valveId: string | null) => void;
  setLine: (patch: Partial<LineSetup>) => void;
  resetSetup: () => void;
}

export const SetupContext = createContext<SetupContextValue | undefined>(undefined);

export const SetupProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [setup, setSetup] = useState<StandSetup>(loadSetup);

  useEffect(() => {
    try {
      localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
    } catch {
      /* хранилище недоступно — установка останется до перезагрузки */
    }
  }, [setup]);

  const value = useMemo<SetupContextValue>(
    () => ({
      ...describeSetup(setup),
      updateParams: (patch) =>
        setSetup((prev) => {
          const onlyPressure = Object.keys(patch).every((key) => key === 'supplyBar');
          return { ...prev, params: { ...prev.params, ...patch }, calibratedFor: onlyPressure ? prev.calibratedFor : null };
        }),
      applyCalibration: (params, valveId) => setSetup((prev) => ({ ...prev, params, valveId, calibratedFor: valveId })),
      selectValve: (valveId) => setSetup((prev) => ({ ...prev, valveId })),
      setLine: (patch) => setSetup((prev) => ({ ...prev, line: { ...prev.line, ...patch } })),
      resetSetup: () => setSetup(DEFAULT_SETUP),
    }),
    [setup]
  );

  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
};
