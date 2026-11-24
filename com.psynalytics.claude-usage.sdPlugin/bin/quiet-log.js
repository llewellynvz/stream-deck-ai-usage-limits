export function quietLog(log) {
  return (line) => {
    try {
      log(line);
    } catch {
      return;
    }
  };
}
