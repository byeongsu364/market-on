import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../../api/reviews';
import Icon from '../common/Icon';
import s from './reviews.module.css';

/**
 * 지도에서 고른 점포 카드에 넣는 한 줄 리뷰 요약(2026-11-27 다듬기).
 * 리뷰 전체를 카드 안에 펼치면 길 안내 버튼이 화면 밖으로 밀려나서, 별점 한 줄과 점포 화면 링크만 둠.
 */
export default function ReviewSummary({ storeId, to }: { storeId: string; to: string }) {
  const [data, setData] = useState<{ average: number | null; count: number }>();
  useEffect(() => {
    let active = true;
    api
      .getReviews(storeId, 1)
      .then((d) => active && setData({ average: d.average, count: d.count }))
      .catch(() => active && setData(undefined));
    return () => {
      active = false;
    };
  }, [storeId]);
  if (!data) return null;
  return (
    <Link to={to} className={s.summary}>
      <span aria-hidden="true">★</span>
      {data.count ? (
        <>
          <strong>{data.average?.toFixed(1)}</strong>
          <span>손님 {data.count}명 리뷰</span>
        </>
      ) : (
        <span>아직 리뷰가 없어요 · 첫 리뷰 쓰기</span>
      )}
      <Icon name="chevronRight" size={16} />
    </Link>
  );
}
