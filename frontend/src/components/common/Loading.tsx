import { useT } from '../../i18n';
import s from './ui.module.css';
export default function Loading({ message }: { message?: string }) {
  const t = useT();
  return (
    <p role="status" className={s.status}>
      {message ?? t('loadingStatus')}
    </p>
  );
}
