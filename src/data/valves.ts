// Каталог распределителей. Сюда вносятся проверенные данные из даташитов производителей —
// у каждой записи обязательно указывается источник. Модели, добавленные через форму на сайте,
// хранятся в браузере; кнопка «Экспорт JSON» выгружает их, и записи можно перенести в этот массив.

export type ValveType = '5/2 моностабильный' | '5/2 бистабильный' | '5/3' | '3/2';
export type SealType = 'эластичное' | 'металл–металл' | 'другое';

export interface Valve {
  id: string;
  maker: string;
  model: string;
  type: ValveType;
  /** время включения по даташиту, мс */
  onMs: number;
  /** время выключения по даташиту, мс (для бистабильного — время переключения в обратную сторону) */
  offMs: number;
  seal: SealType;
  /** номинальный расход, л/мин */
  qnLmin?: number;
  /** масса распределителя, г */
  massG?: number;
  /** ход золотника, мм */
  strokeMm?: number;
  pMinBar?: number;
  pMaxBar?: number;
  /** ссылка на даташит или название документа */
  source: string;
  note?: string;
}

export const VALVE_TYPES: ValveType[] = ['5/2 моностабильный', '5/2 бистабильный', '5/3', '3/2'];
export const SEAL_TYPES: SealType[] = ['эластичное', 'металл–металл', 'другое'];

// Значения сверены с официальными даташитами (Festo — версия от 08.10.2026, SMC — страница серии на smcusa.com).
export const VALVES: Valve[] = [
  {
    id: 'festo-574371',
    maker: 'Festo',
    model: 'VUVG-L14-M52-MT-G18-1P3',
    type: '5/2 моностабильный',
    onMs: 13,
    offMs: 40,
    seal: 'эластичное',
    qnLmin: 700,
    massG: 70,
    pMinBar: 3,
    pMaxBar: 8,
    source: 'https://ftp.festo.com/public/PNEUMATIC/SOFTWARE_SERVICE/DataSheet/EN_GB/574371.pdf',
    note: 'Арт. 574371. Золотниковый, пилотный, возврат механической пружиной; катушка 24 В DC, 1 Вт. Qn 700–780 л/мин.',
  },
  {
    id: 'festo-575249',
    maker: 'Festo',
    model: 'VUVS-L20-M52-AD-G18-F7',
    type: '5/2 моностабильный',
    onMs: 20,
    offMs: 29,
    seal: 'эластичное',
    qnLmin: 700,
    massG: 188,
    pMinBar: 2.5,
    pMaxBar: 10,
    source: 'https://ftp.festo.com/public/PNEUMATIC/SOFTWARE_SERVICE/DataSheet/EN_US/575249.pdf',
    note: 'Арт. 575249. Золотниковый, пилотный, возврат пневмопружиной; C = 2.9 л/(с·бар), b = 0.35.',
  },
  {
    id: 'festo-525117',
    maker: 'Festo',
    model: 'MHE2-MS1H-5/2-QS-4',
    type: '5/2 моностабильный',
    onMs: 1.9,
    offMs: 1.7,
    seal: 'эластичное',
    qnLmin: 90,
    massG: 70,
    pMinBar: -0.9,
    pMaxBar: 8,
    source: 'https://ftp.festo.com/public/PNEUMATIC/SOFTWARE_SERVICE/DataSheet/EN_US/525117.pdf',
    note: 'Арт. 525117. Быстродействующий седельный клапан прямого действия (не золотник), до 300 Гц; допуск времени +10/−30 %.',
  },
  {
    id: 'smc-sy3000',
    maker: 'SMC',
    model: 'SY3000 (SY3120)',
    type: '5/2 моностабильный',
    onMs: 16,
    offMs: 16,
    seal: 'другое',
    pMinBar: 1,
    pMaxBar: 7,
    source: 'https://smcusa.com/products/SY3000-5-Port-Solenoid-Valve-All-Types~50600',
    note: 'SMC даёт одно время отклика для серии: ≤ 16 мс при 0.5 МПа, без индикатора и защиты от перенапряжения — здесь это верхняя граница и для вкл, и для выкл. Давление — для внутреннего пилота. Серия выпускается с эластичным и металлическим уплотнением.',
  },
];
