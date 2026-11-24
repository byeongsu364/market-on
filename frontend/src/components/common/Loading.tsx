import { useT } from '../../i18n';
export default function Loading() {
  const t = useT();
  return <p role="status">{t('loadingStatus')}</p>;
}
