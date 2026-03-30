import { AppShell } from "./app/shell/AppShell";
import { EditorWorkspace } from "./features/file_manager/EditorWorkspace";

function App() {
  if (window.location.hash.startsWith("#/editor")) {
    return <EditorWorkspace />;
  }

  return <AppShell />;
}

export default App;
