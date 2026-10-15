export default function LoginPanel() {
  return (
    <section className="login-panel">
      <h2>Google アカウントを接続</h2>
      <div className="login-actions">
        <a className="btn btn-primary" href="/auth/login">
          Google でログイン
        </a>
      </div>
    </section>
  );
}
