import { Link, useLocation } from 'react-router-dom';
import Icon from '../common/Icon';
import { useShoppingContext } from '../../hooks/useShoppingContext';
import s from './layout.module.css';

// 하단 탭 세 칸: 지도, 찍기, 장바구니. 내 정보는 지도 검색창 오른쪽 둥근 버튼.
export default function TabBar() {
  const { pathname } = useLocation();
  const ctx = useShoppingContext();
  const onMap = pathname === '/' || pathname === '/markets';
  const onShop = pathname.startsWith('/shop');
  return (
    <nav className={s.tabbar} aria-label="주요 메뉴">
      <Link to={ctx.href('/')} className={s.tab} aria-current={onMap ? 'page' : undefined}>
        <Icon name="map" strokeWidth={onMap ? 1.9 : 1.7} />
        지도
      </Link>
      <Link to={ctx.href('/scan', { store: ctx.storeId })} className={s.scan}>
        <Icon name="camera" size={24} />
        찍기
      </Link>
      <Link to={ctx.href('/shop')} className={s.tab} aria-current={onShop ? 'page' : undefined}>
        <Icon name="basket" strokeWidth={onShop ? 1.9 : 1.7} />
        장바구니
      </Link>
    </nav>
  );
}
