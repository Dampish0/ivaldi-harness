# Process launch boundary

This module owns one launch path for Ivaldi-owned child processes such as
lifecycle hooks. It records the execution subject, project context, policy hash,
permission mode, and correlation ID before using the normal host process API.

There is no operating-system sandbox in this module. The current backend is
always `direct`, so filesystem and network access are the same as any other
process started by the Ivaldi user account. Project roots in the policy are
context for audit and routing, not filesystem enforcement.

Manual, Auto, and Full access are valid process-context modes. They all use the
same direct host launcher. Auto changes permission-response policy only; it does
not add filesystem, process, or network containment. Its risk classifier is
owned by `../permission-auto-accept`.

The user terminal remains separate. It is a human-controlled shell and does not
go through this launcher.
