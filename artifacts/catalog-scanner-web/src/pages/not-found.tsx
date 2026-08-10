export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white px-6">
      <div className="max-w-md rounded-2xl border border-black p-6 text-black">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-3 text-sm leading-6">Use the main catalog page to scan barcodes and manage products.</p>
      </div>
    </div>
  );
}
