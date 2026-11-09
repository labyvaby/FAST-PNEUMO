import { NavLink, useLocation } from 'react-router-dom';
import { Status } from '../../launchTypes';
import { useLaunchContext } from '../../useLaunchContext';

const links = [
  { to: '/dashboard', num: '01', label: 'Стенд' },
  { to: '/calculator', num: '02', label: 'Расчёт' },
  { to: '/catalog', num: '03', label: 'Каталог' },
  { to: '/configurator', num: '04', label: 'Конфигуратор' },
  { to: '/utilities', num: '05', label: 'Утилиты' },
  { to: '/methodology', num: '06', label: 'Методика' },
  { to: '/reports', num: '07', label: 'Отчёты' },
];

const Header = () => {
  const { status, launches } = useLaunchContext();
  const { pathname } = useLocation();
  const isRunning = status === Status.STARTED;

  return (
    <header className='hdr'>
      <div className='hdr-in'>
        <NavLink className='brand' to='/dashboard' aria-label='Пневмостенд, на главную'>
          <span className='brand-mark grad'>5/2</span>
          <span>Пневмостенд</span>
        </NavLink>
        <nav className='nav' aria-label='Разделы'>
          {links.map((link) => {
            const isActive = pathname === link.to || (pathname === '/' && link.to === '/dashboard');
            return (
              <NavLink key={link.to} to={link.to} className={isActive ? 'on' : ''}>
                <b>{link.num}</b>
                {link.label}
                {link.to === '/reports' && launches.length > 0 ? ` · ${launches.length}` : ''}
              </NavLink>
            );
          })}
        </nav>
        <span className={`live ${isRunning ? 'on' : ''}`} role='status'>
          <i />
          <span>{isRunning ? 'Эксперимент идёт' : 'Ожидание'}</span>
        </span>
      </div>
    </header>
  );
};

export default Header;
