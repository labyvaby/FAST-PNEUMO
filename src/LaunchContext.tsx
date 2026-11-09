import React, { createContext, useMemo, useState, ReactNode } from 'react';
import { LaunchData, Status } from './launchTypes';

interface LaunchContextProps {
  launches: LaunchData[];
  addLaunch: (launch: LaunchData) => void;
  setCurrentStatus: (newStatus: Status | null) => void;
  status: Status | null;
}

export const LaunchContext = createContext<LaunchContextProps | undefined>(
  undefined
);

export const LaunchProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [launches, setLaunches] = useState<LaunchData[]>([]);
  const [status, setStatus] = useState<Status | null>(Status.STOPPED);

  const addLaunch = (launch: LaunchData) => {
    setLaunches((prevLaunches) => [...prevLaunches, launch]);
  };

  const setCurrentStatus = (newStatus: Status | null) => {
    setStatus(newStatus);
  };

  const value = useMemo(
    () => ({ launches, addLaunch, status, setCurrentStatus }),
    [launches, status]
  );

  return (
    <LaunchContext.Provider value={value}>{children}</LaunchContext.Provider>
  );
};
