{
  description = "keyhive-todo-app-demo";

  inputs = {
    nixpkgs.url = "nixpkgs/nixos-26.05";

    command-utils.url = "git+https://tangled.org/expede.wtf/nix-command-utils";
    flake-utils.url = "github:numtide/flake-utils";

    subduction = {
      url = "github:inkandswitch/subduction";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    command-utils,
    flake-utils,
    nixpkgs,
    subduction,
  }:
    flake-utils.lib.eachDefaultSystem (
      system: let
        pkgs = import nixpkgs {inherit system;};

        nodejs = pkgs.nodejs_22;

        # Pinned to pnpm 10 to match `packageManager` in package.json;
        # pnpm 11 stopped reading `overrides` (pnpm-workspace.yaml keeps the
        # automerge-repo and automerge-subduction overrides there, so a single
        # copy of each WASM-backed package gets installed) and treats ignored
        # build scripts as a hard error.
        pnpm = pkgs.pnpm_10;

        format-pkgs = with pkgs; [
          alejandra
          nixpkgs-fmt
        ];

        js-env = [nodejs pnpm];

        # Scripts that touch .env also need coreutils/grep/sed. writeShellApplication
        # prepends runtimeInputs to PATH rather than replacing it, but naming them
        # keeps the scripts working outside a devShell too.
        script-env = js-env ++ (with pkgs; [coreutils gnugrep gnused]);

        # The demo refuses to start without a phonebook document id, and the id
        # has to stay the same between runs: a fresh one points the app at a
        # brand new, empty phonebook, so every name and avatar disappears (see
        # "Phonebook configuration" in the README). So seed .env once and never
        # overwrite an id that is already there.
        env-init = pkgs.writeShellApplication {
          name = "keyhive-todo-env-init";
          runtimeInputs = script-env;
          text = ''
            if [ -f .env ] && grep -qE '^PHONEBOOK_DOC_ID=.+' .env; then
              echo ".env already sets PHONEBOOK_DOC_ID; leaving it as is."
              exit 0
            fi

            # gen:phonebook-id imports @automerge/automerge-repo/slim.
            if [ ! -d node_modules ]; then
              echo "Installing dependencies first (gen:phonebook-id needs them)..."
              pnpm install --frozen-lockfile
            fi

            phonebook_doc_id="$(pnpm -s gen:phonebook-id)"

            if [ -f .env ]; then
              sed -i '/^PHONEBOOK_DOC_ID=$/d' .env
              printf 'PHONEBOOK_DOC_ID=%s\n' "$phonebook_doc_id" >> .env
            else
              printf 'PHONEBOOK_DOC_ID=%s\n' "$phonebook_doc_id" > .env
            fi

            echo "Wrote PHONEBOOK_DOC_ID=$phonebook_doc_id to .env"
            echo "Share that id with the people you want in your phonebook."
          '';
        };

        dev = pkgs.writeShellApplication {
          name = "keyhive-todo-dev";
          runtimeInputs = script-env ++ [env-init];
          text = ''
            keyhive-todo-env-init
            pnpm install
            pnpm dev "$@"
          '';
        };

        mkCheck = name: text:
          pkgs.writeShellApplication {
            name = "keyhive-todo-${name}";
            runtimeInputs = js-env;
            text = ''
              set -x
              ${text}
            '';
          };

        # Each check assumes `pnpm install --frozen-lockfile` has already run
        # (the `ci` aggregate does it for you).
        ci-checks = {
          ci-lint = mkCheck "ci-lint" ''
            pnpm run lint
          '';

          # tsconfig.json sets noEmit, so this is a typecheck only. `pnpm build`
          # runs it too; kept separate for a fast failure before the bundle.
          ci-tsc = mkCheck "ci-tsc" ''
            pnpm exec tsc -p tsconfig.json
          '';

          # Mirrors the build step of .github/workflows/deploy.yml, which reads
          # PHONEBOOK_DOC_ID from a repository variable. A throwaway id is fine
          # here: nothing connects to the phonebook, we only want the bundle to
          # compile. Never reuse one of these for a real run.
          ci-build = mkCheck "ci-build" ''
            PHONEBOOK_DOC_ID="$(pnpm -s gen:phonebook-id)" pnpm run build
          '';
        };

        ci-all = pkgs.writeShellApplication {
          name = "keyhive-todo-ci";
          runtimeInputs = js-env ++ pkgs.lib.attrValues ci-checks;
          text = ''
            pnpm install --frozen-lockfile
            ${pkgs.lib.concatMapStringsSep "\n"
              (check: "keyhive-todo-${check}")
              (builtins.attrNames ci-checks)}
          '';
        };

        # A local stand-in for wss://keyhive.sync.automerge.org. Bound to
        # loopback on the port the README's SYNC_SERVER example uses. A stock
        # server runs the built-in "keyhive" identity, which is what the demo
        # expects when SYNC_SERVER_CONTACT_CARD/PEER_ID are unset, so no key
        # configuration is needed.
        sync-server = pkgs.writeShellApplication {
          name = "keyhive-todo-sync-server";
          runtimeInputs = [subduction.packages.${system}.subduction_cli];
          text = ''
            data_dir="''${XDG_DATA_HOME:-$HOME/.local/share}/keyhive-todo-demo/subduction"
            mkdir -p "$data_dir"
            echo "Point the demo at it with: SYNC_SERVER=ws://localhost:3030 pnpm dev"
            exec subduction_cli server \
              --socket 127.0.0.1:3030 \
              --data-dir "$data_dir" \
              "$@"
          '';
        };

        cmd = command-utils.cmd.${system};
        pnpm' = command-utils.pnpm.${system};

        command_menu = command-utils.commands.${system} [
          (pnpm'.build {pnpm = "${pnpm}/bin/pnpm";})
          (pnpm'.install {pnpm = "${pnpm}/bin/pnpm";})

          (command-utils.asModule.${system} {
            "dev" = cmd "Seed .env if needed, then run the dev server on :5557" ''
              exec ${dev}/bin/keyhive-todo-dev "$@"
            '';

            "dev:local" = cmd "Dev server against a local sync server on :3030" ''
              export SYNC_SERVER="ws://localhost:3030"
              exec ${dev}/bin/keyhive-todo-dev "$@"
            '';

            "env:init" = cmd "Write a fresh PHONEBOOK_DOC_ID to .env if absent" ''
              exec ${env-init}/bin/keyhive-todo-env-init
            '';

            "gen:phonebook-id" = cmd "Print a fresh phonebook document id" ''
              exec ${pnpm}/bin/pnpm -s gen:phonebook-id
            '';

            "lint" = cmd "ESLint + Prettier check" ''
              exec ${pnpm}/bin/pnpm run lint
            '';

            "lint:fix" = cmd "Apply ESLint + Prettier fixes" ''
              exec ${pnpm}/bin/pnpm run lint:fix
            '';

            "preview" = cmd "Serve the built site from dist/" ''
              exec ${pnpm}/bin/pnpm run preview "$@"
            '';

            # Deliberately shelled out to rather than interpolated: referring to
            # the derivation here would make entering the devShell build the
            # whole Rust workspace. This way it is built on first use.
            "sync-server" = cmd "Run a local subduction sync server on :3030" ''
              exec nix run .#sync-server -- "$@"
            '';

            "ci" = cmd "Run all CI checks (lint, tsc, build)" ''
              exec ${ci-all}/bin/keyhive-todo-ci
            '';
          })
        ];
      in {
        devShells.default = pkgs.mkShell {
          name = "keyhive-todo-app-demo_shell";

          nativeBuildInputs =
            command_menu
            ++ js-env
            ++ [
              pkgs.typescript
              pkgs.typescript-language-server
            ]
            ++ format-pkgs;

          shellHook = ''
            unset SOURCE_DATE_EPOCH
            export WORKSPACE_ROOT="$(pwd)"
            menu
          '';
        };

        apps =
          pkgs.lib.mapAttrs (name: check: {
            type = "app";
            program = "${check}/bin/keyhive-todo-${name}";
          })
          (ci-checks
            // {
              ci = ci-all;
              dev = dev;
              env-init = env-init;
              sync-server = sync-server;
            });

        formatter = pkgs.alejandra;
      }
    );
}
