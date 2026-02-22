// backend/src/stubs_macros.rs
#[macro_export]
macro_rules! command {
    ($($tokens:tt)*) => {
        $($tokens)*
    };
}
