import { useT } from '../../i18n';
import Button from './Button';
export default function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  const t = useT();
  return (
    <div role="alert">
      <p>{message}</p>
      {retry && <Button onClick={retry}>{t('retry')}</Button>}
    </div>
  );
}
