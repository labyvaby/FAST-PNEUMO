// Общие настройки Chart.js под тёмную тему стенда. Импортируйте этот модуль в любой странице с графиками.
import Chart from 'chart.js/auto';

Chart.defaults.color = '#7A788F';
Chart.defaults.font.family = '"JetBrains Mono", ui-monospace, monospace';
Chart.defaults.font.size = 11;

export const GRID = 'rgba(255,255,255,0.06)';
export const AXIS = 'rgba(255,255,255,0.17)';

export const TOOLTIP = {
  backgroundColor: 'rgba(10,11,20,0.95)',
  borderColor: 'rgba(255,255,255,0.17)',
  borderWidth: 1,
  titleColor: '#F4F2EE',
  bodyColor: '#B9B7C8',
  padding: 10,
};

export const COLORS = {
  teal: '#1FB6CE',
  green: '#44C18A',
  blue: '#3E74F0',
  violet: '#8B6CFF',
  amber: '#F2B43C',
  red: '#E5484D',
  ink: '#F4F2EE',
  faint: 'rgba(244,242,238,0.3)',
};

export default Chart;
