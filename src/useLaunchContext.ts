import { useContext } from 'react';
import { LaunchContext } from './LaunchContext';

export const useLaunchContext = () => {
  const context = useContext(LaunchContext);
  if (context === undefined) {
    throw new Error('useLaunchContext must be used within a LaunchProvider');
  }
  return context;
};
