import { Route, Routes } from 'react-router-dom';
import { Header } from './components/Header';
import SetupBar from './setup/SetupBar';
import { Dashboard } from './pages/Dashboard';
import { Methodology } from './pages/Methodology';
import Reports from './pages/Reports/Reports';
import Calculator from './pages/Calculator/Calculator';
import Catalog from './pages/Catalog/Catalog';
import Configurator from './pages/Configurator/Configurator';
import Utilities from './pages/Utilities/Utilities';

function App() {
  return (
    <>
      {/* общий градиент для кольца в заголовке и шкалы хода */}
      <svg width='0' height='0' style={{ position: 'absolute' }} aria-hidden='true'>
        <defs>
          <linearGradient id='ringGrad' x1='0' x2='1' y1='0' y2='0'>
            <stop offset='0' stopColor='#44C18A' />
            <stop offset='.4' stopColor='#1FB6CE' />
            <stop offset='.75' stopColor='#3E74F0' />
            <stop offset='1' stopColor='#8B6CFF' />
          </linearGradient>
          <linearGradient id='gaugeGrad' x1='0' x2='1' y1='1' y2='0'>
            <stop offset='0' stopColor='#44C18A' />
            <stop offset='.45' stopColor='#1FB6CE' />
            <stop offset='1' stopColor='#3E74F0' />
          </linearGradient>
        </defs>
      </svg>
      <Header />
      <SetupBar />
      <main>
        <Routes>
          <Route path='/dashboard' element={<Dashboard />} />
          <Route path='/calculator' element={<Calculator />} />
          <Route path='/catalog' element={<Catalog />} />
          <Route path='/configurator' element={<Configurator />} />
          <Route path='/utilities' element={<Utilities />} />
          <Route path='/methodology' element={<Methodology />} />
          <Route path='/reports' element={<Reports />} />
          <Route path='/' element={<Dashboard />} />
        </Routes>
      </main>
      <footer className='foot'>
        <div className='wrap foot-in'>
          <p>Стенд исследования быстродействия · распределитель 5/2</p>
          <p>Инженерная модель · данные рассчитаны в браузере</p>
        </div>
      </footer>
    </>
  );
}

export default App;
