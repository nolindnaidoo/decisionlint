# decisionlint, the command line: the request, then the findings on it.
#   bun run build:npm, then from letools-site: bun run record:demo ../decisionlint cli
# Runs in a temp copy, so nothing here is changed and no home path is shown.

Set Shell "bash"
Set FontSize 28
Set Width 1600
Set Height 1000
Set Padding 32
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"

Hide
Type `D=$PWD; cd "$(mktemp -d)" && cp "$D/request.jev.json" . && alias decisionlint="node $D/../../../npm/cli.js" && PS1="$ " && clear`
Enter
Type "cat request.jev.json"
Enter
Sleep 1s
Show
Sleep 4s
Hide
Type "clear"
Enter
Show
Type "decisionlint request.jev.json"
Enter
Sleep 9s
