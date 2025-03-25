import React from "react";

import { asciiLogo } from "./logo";
import styles from "./styles.module.css";

export function AsciiLogo() {
  return <pre className={styles.ascii}>{asciiLogo}</pre>;
}
