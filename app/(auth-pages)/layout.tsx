export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-7xl w-full flex flex-col gap-12 items-center">
        {children}
      </div>
    </div>
  );
}