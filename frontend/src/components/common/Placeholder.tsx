import AppHeader from '../layout/AppHeader';
// 아직 옮기지 않은 화면 자리(지시서 030 작업 중에만 씀)
export default function Placeholder({ title }: { title: string }) {
  return (
    <>
      <AppHeader title={title} />
      <div className="page">
        <p>준비 중인 화면이에요.</p>
      </div>
    </>
  );
}
